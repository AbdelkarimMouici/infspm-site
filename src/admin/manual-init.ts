// Must be evaluated before decap-cms-app is imported: tells Decap not to auto-start,
// so we can pass the site origin as the OAuth base URL (the domain is not decided yet).
declare global {
  interface Window {
    CMS_MANUAL_INIT?: boolean;
  }
}

window.CMS_MANUAL_INIT = true;

export {};
