import { call } from './ubus';

export interface Pkg { name: string; version: string; description?: string; size?: number; origin?: string; core?: boolean }
export interface Upgradable { name: string; from?: string; to: string }
export type JobState = 'idle' | 'running' | 'done';
export interface PkgJob { state: JobState; cmd?: string; code?: number | null; started?: number; ended?: number; log?: string }
export type PkgAction = 'update' | 'upgrade' | 'add' | 'del';

export const getInstalled = async () => (await call<{ packages: Pkg[] }>('lumen', 'pkg_installed')).packages ?? [];
export const getUpgradable = async () => (await call<{ packages: Upgradable[] }>('lumen', 'pkg_upgradable')).packages ?? [];
export const searchPackages = (q: string) => call<{ results?: Pkg[]; total?: number; error?: string }>('lumen', 'pkg_search', { q });
export const planPackages = (action: Exclude<PkgAction, 'update'>, pkgs: string[]) => call<{ text?: string; error?: string }>('lumen', 'pkg_plan', { action, pkgs: pkgs.join(' ') });
export const runPackages = (action: PkgAction, pkgs: string[] = []) => call<{ started?: boolean; error?: string }>('lumen', 'pkg_run', { action, pkgs: pkgs.join(' ') });
export const getJob = () => call<PkgJob>('lumen', 'pkg_status');
