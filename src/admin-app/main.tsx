/** @jsxImportSource preact */
// Admin panel entry point (loaded by src/pages/admin/index.astro as a same-origin module: strict CSP).
import { render } from 'preact';
import { createApi } from './api';
import { App } from './App';

const root = document.getElementById('admin-root');
if (root) {
  void createApi().then((api) => {
    root.textContent = '';
    render(<App api={api} />, root);
  });
}
