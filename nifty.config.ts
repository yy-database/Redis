// Nifty project configuration for Redis (hybrid cargo + pnpm).
import { defineConfig } from '@doki-land/nifty';

export default defineConfig({
    trust: {
        npm: {
            repo: 'yy-database/Redis',
            file: 'publish-npm.yml',
            environment: 'NPM_PUBLISH',
        },
    },
});
