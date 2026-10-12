// router.js — Hash-based router (GitHub Pages safe)
// Routes are stored in the URL hash like #/buildings/abc123/edit
// so no server-side rewrites are needed.

import { ROUTES } from './config.js';

const listeners = new Set();
let currentPath = null;
let currentParams = [];

/** Read current path + params from location.hash. */
export function parse() {
  let h = location.hash || '';
  if (h.startsWith('#')) h = h.slice(1);
  if (!h) h = '/';
  const parts = h.split('/').filter(Boolean); // ['buildings','abc123','edit']
  const path = '/' + parts.join('/');
  return { path, parts };
}

/** Build a path string from a route name + params. */
export function buildPath(routeName, ...params) {
  const base = routeName.startsWith('/') ? routeName : `/${routeName}`;
  const extra = params.filter(p => p != null && p !== '').map(encodeURIComponent).join('/');
  return extra ? `${base}/${extra}` : base;
}

/** Navigate to a path. */
export function navigate(path, opts = {}) {
  if (!path.startsWith('/')) path = '/' + path;
  if (opts.replace) {
    location.replace('#' + path);
  } else {
    location.hash = '#' + path;
  }
  // hashchange listener will dispatch
}

/** Go back in history, fallback to a path. */
export function backOr(fallbackPath = '/') {
  if (history.length > 1) {
    history.back();
  } else {
    navigate(fallbackPath);
  }
}

/** Subscribe to route changes. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Find a route definition that matches a parsed path. */
export function matchRoute(parsed) {
  // Exact match first
  for (const r of ROUTES) {
    if (r.path === parsed.path) return { route: r, params: [] };
  }
  // Prefix match (e.g. /buildings/abc → /buildings route, params=['abc'])
  for (const r of ROUTES) {
    if (parsed.path.startsWith(r.path + '/')) {
      const rest = parsed.path.slice(r.path.length + 1);
      return { route: r, params: rest.split('/').filter(Boolean) };
    }
  }
  return { route: null, params: parsed.parts };
}

function dispatch() {
  const parsed = parse();
  if (parsed.path === currentPath) {
    // Same path — still notify (sub-routes may want to react)
  }
  currentPath = parsed.path;
  currentParams = parsed.parts;
  for (const fn of listeners) {
    try { fn(parsed); } catch (e) { console.error('router listener error', e); }
  }
}

export function start() {
  window.addEventListener('hashchange', dispatch);
  // Initial dispatch
  if (!location.hash) location.hash = '#/';
  dispatch();
}

export function current() {
  return { path: currentPath, parts: currentParams };
}

export default { start, navigate, subscribe, parse, buildPath, matchRoute, backOr, current };
