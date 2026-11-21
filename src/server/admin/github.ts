/**
 * Minimal GitHub client for the admin panel (server side only; the browser never sees the token).
 *
 * Token: GITHUB_CMS_TOKEN, a fine-grained token limited to this repository with "Contents: read and write"
 * and "Pull requests: read and write" (docs/ADMIN.md). Every change is a commit on its own branch
 * (cms/…) plus a pull request into the protected `main` branch, so the CI checks run before anything is live.
 */

export interface GitHubConfig {
  token: string;
  repo: string; // "owner/name"
  branch?: string; // default "main"
  fetch?: typeof fetch;
}

export interface FileChange {
  path: string;
  /** UTF-8 text, or base64 bytes when `encoding` is "base64". `null` deletes the file. */
  content: string | null;
  encoding?: 'utf-8' | 'base64';
}

export interface TreeFile {
  path: string;
  sha: string;
  text: string | null;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  branch: string;
  author: string;
  createdAt: string;
  url: string;
  autoMerge: boolean;
  checks: 'pending' | 'success' | 'failure';
  awaitingApproval: boolean;
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class GitHub {
  private readonly owner: string;
  private readonly name: string;
  readonly branch: string;
  private readonly http: typeof fetch;

  constructor(private readonly config: GitHubConfig) {
    const [owner, name] = config.repo.split('/');
    if (!owner || !name) throw new Error('GITHUB_REPO must be "owner/name"');
    this.owner = owner;
    this.name = name;
    this.branch = config.branch ?? 'main';
    // Never store the global fetch unbound: the Workers runtime throws "Illegal invocation" when it is
    // called as a method of another object. Wrap it so it always runs with its own `this`.
    const http = config.fetch;
    this.http = http ? (input, init) => http(input, init) : (input, init) => fetch(input, init);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.http(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'infspm-admin',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let message = text;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        /* keep text */
      }
      throw new GitHubError(response.status, `GitHub ${method} ${path.split('?')[0]}: ${response.status} ${message}`.slice(0, 300));
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private repoPath(rest: string): string {
    return `/repos/${this.owner}/${this.name}${rest}`;
  }

  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const result = await this.request<{ data?: T; errors?: { message: string }[] }>('POST', '/graphql', { query, variables });
    if (result.errors?.length) throw new GitHubError(502, result.errors.map((e) => e.message).join('; '));
    if (!result.data) throw new GitHubError(502, 'Empty GraphQL response');
    return result.data;
  }

  /** Text and blob sha of every file directly inside the given folders (one GraphQL request). */
  async readFolders(folders: string[]): Promise<TreeFile[]> {
    if (folders.length === 0) return [];
    const parts = folders.map(
      (folder, i) =>
        `f${i}: object(expression: ${JSON.stringify(`${this.branch}:${folder}`)}) { ... on Tree { entries { name type oid object { ... on Blob { text isBinary } } } } }`,
    );
    const data = await this.graphql<{ repository: Record<string, { entries: { name: string; type: string; oid: string; object: { text: string | null; isBinary: boolean } | null }[] } | null> }>(
      `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${parts.join('\n')} } }`,
      { owner: this.owner, name: this.name },
    );
    const files: TreeFile[] = [];
    folders.forEach((folder, i) => {
      for (const entry of data.repository[`f${i}`]?.entries ?? []) {
        if (entry.type !== 'blob') continue;
        files.push({ path: `${folder}/${entry.name}`, sha: entry.oid, text: entry.object?.isBinary ? null : (entry.object?.text ?? null) });
      }
    });
    return files;
  }

  /** Raw bytes of a file on the main branch. */
  async readBytes(path: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; sha: string }> {
    const file = await this.request<{ content: string; encoding: string; sha: string }>(
      'GET',
      this.repoPath(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(this.branch)}`),
    );
    const binary = atob(file.content.replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, sha: file.sha };
  }

  async readText(path: string): Promise<{ text: string; sha: string } | null> {
    try {
      const { bytes, sha } = await this.readBytes(path);
      return { text: new TextDecoder().decode(bytes), sha };
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }
  }

  /** One commit with all changes, on a new branch created from main. Returns the branch name. */
  async commitToNewBranch(branch: string, message: string, changes: FileChange[], author: { name: string }): Promise<void> {
    const head = await this.request<{ object: { sha: string } }>('GET', this.repoPath(`/git/ref/heads/${this.branch}`));
    const base = await this.request<{ tree: { sha: string } }>('GET', this.repoPath(`/git/commits/${head.object.sha}`));
    const tree = await Promise.all(
      changes.map(async (change) => {
        if (change.content === null) return { path: change.path, mode: '100644', type: 'blob', sha: null };
        const blob = await this.request<{ sha: string }>('POST', this.repoPath('/git/blobs'), {
          content: change.content,
          encoding: change.encoding ?? 'utf-8',
        });
        return { path: change.path, mode: '100644', type: 'blob', sha: blob.sha };
      }),
    );
    const newTree = await this.request<{ sha: string }>('POST', this.repoPath('/git/trees'), { base_tree: base.tree.sha, tree });
    const commit = await this.request<{ sha: string }>('POST', this.repoPath('/git/commits'), {
      message,
      tree: newTree.sha,
      parents: [head.object.sha],
      author: { name: author.name, email: 'admin-panel@users.noreply.github.com' },
    });
    await this.request('POST', this.repoPath('/git/refs'), { ref: `refs/heads/${branch}`, sha: commit.sha });
  }

  async openPullRequest(branch: string, title: string, body: string): Promise<{ number: number; nodeId: string; url: string }> {
    const pr = await this.request<{ number: number; node_id: string; html_url: string }>('POST', this.repoPath('/pulls'), {
      title,
      body,
      head: branch,
      base: this.branch,
    });
    return { number: pr.number, nodeId: pr.node_id, url: pr.html_url };
  }

  /** Merge automatically once the required checks pass. Returns false if auto-merge is unavailable. */
  async enableAutoMerge(nodeId: string): Promise<boolean> {
    try {
      await this.graphql(
        `mutation($id: ID!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) { clientMutationId } }`,
        { id: nodeId },
      );
      return true;
    } catch {
      return false;
    }
  }

  async pullRequestNodeId(number: number): Promise<string> {
    const pr = await this.request<{ node_id: string }>('GET', this.repoPath(`/pulls/${number}`));
    return pr.node_id;
  }

  /** Merges now if possible (checks green). Returns true when merged. */
  async tryMerge(number: number): Promise<boolean> {
    try {
      await this.request('PUT', this.repoPath(`/pulls/${number}/merge`), { merge_method: 'squash' });
      return true;
    } catch (error) {
      if (error instanceof GitHubError && [405, 409].includes(error.status)) return false;
      throw error;
    }
  }

  async closePullRequest(number: number, branch: string): Promise<void> {
    await this.request('PATCH', this.repoPath(`/pulls/${number}`), { state: 'closed' });
    await this.request('DELETE', this.repoPath(`/git/refs/heads/${branch}`)).catch(() => undefined);
  }

  async checksFor(ref: string): Promise<'pending' | 'success' | 'failure'> {
    const result = await this.request<{ check_runs: { status: string; conclusion: string | null }[] }>(
      'GET',
      this.repoPath(`/commits/${encodeURIComponent(ref)}/check-runs?per_page=50`),
    );
    const runs = result.check_runs;
    if (runs.length === 0) return 'pending';
    if (runs.some((r) => r.status === 'completed' && r.conclusion && !['success', 'neutral', 'skipped'].includes(r.conclusion))) {
      return 'failure';
    }
    return runs.every((r) => r.status === 'completed') ? 'success' : 'pending';
  }

  /** Open pull requests created by the admin panel (branches cms/…). */
  async openChanges(): Promise<PullRequestInfo[]> {
    const prs = await this.request<
      {
        number: number;
        title: string;
        html_url: string;
        created_at: string;
        body: string | null;
        auto_merge: unknown;
        head: { ref: string; sha: string };
      }[]
    >('GET', this.repoPath(`/pulls?state=open&base=${encodeURIComponent(this.branch)}&per_page=50`));
    const mine = prs.filter((pr) => pr.head.ref.startsWith('cms/'));
    return Promise.all(
      mine.map(async (pr) => ({
        number: pr.number,
        title: pr.title,
        branch: pr.head.ref,
        author: /^Author: (.+)$/m.exec(pr.body ?? '')?.[1] ?? '',
        createdAt: pr.created_at,
        url: pr.html_url,
        autoMerge: Boolean(pr.auto_merge),
        checks: await this.checksFor(pr.head.sha).catch(() => 'pending' as const),
        awaitingApproval: /^Awaiting approval: yes$/m.test(pr.body ?? ''),
      })),
    );
  }

  /** Status of the live site: checks of the latest commit on main. */
  async liveStatus(): Promise<{ sha: string; date: string; checks: 'pending' | 'success' | 'failure' }> {
    const commit = await this.request<{ sha: string; commit: { committer: { date: string } } }>(
      'GET',
      this.repoPath(`/commits/${encodeURIComponent(this.branch)}`),
    );
    return { sha: commit.sha.slice(0, 7), date: commit.commit.committer.date, checks: await this.checksFor(commit.sha) };
  }
}
