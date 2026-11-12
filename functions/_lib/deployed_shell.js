// The Command Center shell version this deploy serves (SHELL_CACHE in app/sw.js). Written by build/sync_app.py in
// the same pass that copies app/sw.js, and checked again by build/stage_pages_bundle.py before every deploy.
// It is the ceiling for the store's minShellVer (holdMinShellVer in d1_store.js). Do not edit by hand.
export const DEPLOYED_SHELL_VER = '19.6.278';
