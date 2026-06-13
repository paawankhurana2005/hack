export const env = {
  NVIDIA_API_KEY: process.env['NVIDIA_API_KEY'] ?? '',
  PORT: Number(process.env['PORT'] ?? 4000),
};

export const MOCK_MODE: boolean = env.NVIDIA_API_KEY === '';
