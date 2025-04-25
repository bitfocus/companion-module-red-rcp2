import type { Hub } from '@sentry/core';
import type { EventProcessor, Integration } from '@sentry/types';
interface ApolloOptions {
    useNestjs?: boolean;
}
/** Tracing integration for Apollo */
export declare class Apollo implements Integration {
    /**
     * @inheritDoc
     */
    static id: string;
    /**
     * @inheritDoc
     */
    name: string;
    private readonly _useNest;
    /**
     * @inheritDoc
     */
    constructor(options?: ApolloOptions);
    /**
     * @inheritDoc
     */
    setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void;
}
export {};
//# sourceMappingURL=apollo.d.ts.map