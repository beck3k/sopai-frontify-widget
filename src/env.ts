type Environment = 'development' | 'staging' | 'production';

type EnvConfig = {
    environment: Environment;
    apiBase: string;
    iframeOrigin: string;
};

const PRODUCTION: EnvConfig = {
    environment: 'production',
    apiBase: 'https://api.perpetual-teammate.com',
    iframeOrigin: 'https://app.perpetual-teammate.com',
};

const DEV_OVERRIDE_KEY = 'sopai_env';

function resolveDevEnv(): EnvConfig {
    let override: string | null = null;
    try {
        override = localStorage.getItem(DEV_OVERRIDE_KEY);
    } catch {
        // ignore storage errors
    }

    if (override === 'production') {
        return PRODUCTION;
    }
    if (override === 'staging') {
        return {
            environment: 'staging',
            apiBase: 'https://dev.api.perpetual-teammate.com',
            iframeOrigin: 'https://dev.perpetual-teammate.com',
        };
    }
    return {
        environment: 'development',
        apiBase: 'http://localhost:8000',
        iframeOrigin: 'http://localhost:3000',
    };
}

// In production builds, Vite replaces `import.meta.env.PROD` with the literal
// `true`, so the dev branch is dead-code eliminated and only production URLs
// ship. In dev builds, set `localStorage.sopai_env = 'staging' | 'production'`
// to point the running widget at a different backend.
export const env: EnvConfig = import.meta.env.PROD ? PRODUCTION : resolveDevEnv();

console.log('[SOPAI:env] resolved environment:', env);
