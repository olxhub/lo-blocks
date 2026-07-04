// @vitest-environment jsdom
// apps/web/integration/demo-render.assessment.test.ts
//
// One shard of the demo-render sweep — see demoRenderHarness.ts for the
// machinery and DEMO_RENDER_SHARDS for the category assignment;
// demo-render.test.ts asserts the shards jointly cover every category.
import { registerDemoRenderShard } from './demoRenderHarness';

registerDemoRenderShard('assessment');
