// Single source of truth for env-derived values: re-exported from the validated
// `config` so there's no second, divergent reader of process.env. MOCK_MODE is
// derived here for the return-flow handlers that branch on it.

import { config } from '../config.js';

export const env = {
  NVIDIA_API_KEY: config.NVIDIA_API_KEY,
  PORT: config.PORT,
};

export const MOCK_MODE: boolean = config.NVIDIA_API_KEY === '';
