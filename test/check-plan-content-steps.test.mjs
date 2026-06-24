import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('content step services expose runner bridge and idea intake service', async () => {
  await readFile(new URL('../src/opzava/modules/content/steps/step-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/idea-intake-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/idea-intake-service.test.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/step-service.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createContentStepExecutor/);
  assert.match(contentIndex, /ideaIntakeStepService/);
});

test('case study records content idea intake step service progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0051-content-idea-intake-step-service.md', import.meta.url), 'utf8');

  assert.match(readme, /0051-content-idea-intake-step-service\.md/);
  assert.match(entry, /^# 0051: Content Idea Intake Step Service/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createContentStepExecutor/);
  assert.match(entry, /ideaIntakeStepService/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content keyword research step service exposes provider, service, and runner integration', async () => {
  await readFile(new URL('../src/opzava/modules/content/steps/keyword-research-provider.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/keyword-research-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/keyword-research-service.test.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/keyword-research-runner.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createKeywordResearchStepService/);
  assert.match(contentIndex, /createMockKeywordResearchProvider/);
});

test('case study records content keyword research step service progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0052-content-keyword-research-step-service.md', import.meta.url), 'utf8');

  assert.match(readme, /0052-content-keyword-research-step-service\.md/);
  assert.match(entry, /^# 0052: Content Keyword Research Step Service/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createKeywordResearchStepService/);
  assert.match(entry, /createContentArtifact/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content source capture step service exposes provider, service, and runner integration', async () => {
  await readFile(new URL('../src/opzava/modules/content/steps/source-capture-provider.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/source-capture-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/source-capture-service.test.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/source-capture-runner.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createSourceCaptureStepService/);
  assert.match(contentIndex, /createMockSourceCaptureProvider/);
});

test('case study records content source capture step service progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0053-content-source-capture-step-service.md', import.meta.url), 'utf8');

  assert.match(readme, /0053-content-source-capture-step-service\.md/);
  assert.match(entry, /^# 0053: Content Source Capture Step Service/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createSourceCaptureStepService/);
  assert.match(entry, /createContentArtifact/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content seo brief step service exposes provider, service, and runner integration', async () => {
  await readFile(new URL('../src/opzava/modules/content/steps/seo-brief-provider.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/seo-brief-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/seo-brief-service.test.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/seo-brief-runner.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createSeoBriefStepService/);
  assert.match(contentIndex, /createMockSeoBriefProvider/);
});

test('case study records content seo brief step service progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0054-content-seo-brief-step-service.md', import.meta.url), 'utf8');

  assert.match(readme, /0054-content-seo-brief-step-service\.md/);
  assert.match(entry, /^# 0054: Content SEO Brief Step Service/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createSeoBriefStepService/);
  assert.match(entry, /createContentArtifact/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content outline step service exposes provider, service, and runner integration', async () => {
  await readFile(new URL('../src/opzava/modules/content/steps/outline-provider.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/outline-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/outline-service.test.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/outline-runner.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createOutlineStepService/);
  assert.match(contentIndex, /createMockOutlineProvider/);
});

test('case study records content outline step service progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0055-content-outline-step-service.md', import.meta.url), 'utf8');

  assert.match(readme, /0055-content-outline-step-service\.md/);
  assert.match(entry, /^# 0055: Content Outline Step Service/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createOutlineStepService/);
  assert.match(entry, /createContentArtifact/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content article draft step service exposes provider, service, and runner integration', async () => {
  await readFile(new URL('../src/opzava/modules/content/steps/article-draft-provider.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/article-draft-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/article-draft-service.test.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/article-draft-runner.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createArticleDraftStepService/);
  assert.match(contentIndex, /createMockArticleDraftProvider/);
});

test('case study records content article draft step service progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0056-content-article-draft-step-service.md', import.meta.url), 'utf8');

  assert.match(readme, /0056-content-article-draft-step-service\.md/);
  assert.match(entry, /^# 0056: Content Article Draft Step Service/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createArticleDraftStepService/);
  assert.match(entry, /createContentArtifact/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content fact check step service exposes provider, service, and runner integration', async () => {
  await readFile(new URL('../src/opzava/modules/content/steps/fact-check-provider.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/fact-check-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/fact-check-service.test.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/fact-check-runner.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createFactCheckStepService/);
  assert.match(contentIndex, /createMockFactCheckProvider/);
});

test('case study records content fact check step service progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0057-content-fact-check-step-service.md', import.meta.url), 'utf8');

  assert.match(readme, /0057-content-fact-check-step-service\.md/);
  assert.match(entry, /^# 0057: Content Fact Check Step Service/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createFactCheckStepService/);
  assert.match(entry, /createContentArtifact/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content brand review step service exposes provider, service, and runner integration', async () => {
  await readFile(new URL('../src/opzava/modules/content/steps/brand-review-provider.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/brand-review-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/brand-review-service.test.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/brand-review-runner.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createBrandReviewStepService/);
  assert.match(contentIndex, /createMockBrandReviewProvider/);
});

test('case study records content brand review step service progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0058-content-brand-review-step-service.md', import.meta.url), 'utf8');

  assert.match(readme, /0058-content-brand-review-step-service\.md/);
  assert.match(entry, /^# 0058: Content Brand Review Step Service/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createBrandReviewStepService/);
  assert.match(entry, /createContentArtifact/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content anti slop review step service exposes provider, service, and runner integration', async () => {
  await readFile(new URL('../src/opzava/modules/content/steps/anti-slop-review-provider.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/anti-slop-review-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/anti-slop-review-service.test.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/anti-slop-review-runner.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createAntiSlopReviewStepService/);
  assert.match(contentIndex, /createMockAntiSlopReviewProvider/);
});

test('case study records content anti slop review step service progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0059-content-anti-slop-review-step-service.md', import.meta.url), 'utf8');

  assert.match(readme, /0059-content-anti-slop-review-step-service\.md/);
  assert.match(entry, /^# 0059: Content Anti Slop Review Step Service/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createAntiSlopReviewStepService/);
  assert.match(entry, /createContentArtifact/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content human approval step service exposes provider, service, and runner integration', async () => {
  await readFile(new URL('../src/opzava/modules/content/steps/human-approval-provider.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/human-approval-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/human-approval-service.test.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/human-approval-runner.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createHumanApprovalStepService/);
  assert.match(contentIndex, /createMockHumanApprovalProvider/);
});

test('case study records content human approval step service progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0060-content-human-approval-step-service.md', import.meta.url), 'utf8');

  assert.match(readme, /0060-content-human-approval-step-service\.md/);
  assert.match(entry, /^# 0060: Content Human Approval Step Service/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createHumanApprovalStepService/);
  assert.match(entry, /Approval/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content wordpress draft step service exposes provider, service, and runner integration', async () => {
  await readFile(new URL('../src/opzava/modules/content/steps/wordpress-draft-provider.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/wordpress-draft-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/wordpress-draft-service.test.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/steps/wordpress-draft-runner.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createWordpressDraftStepService/);
  assert.match(contentIndex, /createMockWordpressDraftProvider/);
});

test('case study records content wordpress draft step service progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0061-content-wordpress-draft-step-service.md', import.meta.url), 'utf8');

  assert.match(readme, /0061-content-wordpress-draft-step-service\.md/);
  assert.match(entry, /^# 0061: Content WordPress Draft Step Service/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createWordpressDraftStepService/);
  assert.match(entry, /draft-only/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content workflow executor wires the eleven steps end to end', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/content-workflow-executor.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/content-workflow-executor.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /runContentWorkflow/);
  assert.match(contentIndex, /createMockContentWorkflowProviders/);
});

test('case study records content workflow executor progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0062-content-workflow-executor.md', import.meta.url), 'utf8');

  assert.match(readme, /0062-content-workflow-executor\.md/);
  assert.match(entry, /^# 0062: Content Workflow Executor/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /runContentWorkflow/);
  assert.match(entry, /draft-only/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content keyword research provider adapter binds to the platform provider contract', async () => {
  await readFile(new URL('../src/opzava/modules/content/providers/keyword-research-adapter.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/providers/keyword-research-adapter.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createMockKeywordResearchProviderAdapter/);
});

test('case study records content keyword research provider adapter progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0063-content-keyword-research-provider-adapter.md', import.meta.url), 'utf8');

  assert.match(readme, /0063-content-keyword-research-provider-adapter\.md/);
  assert.match(entry, /^# 0063: Content Keyword Research Provider Adapter/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /ProviderAdapter/);
  assert.match(entry, /ExternalCall/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content keyword research execution routes through the platform execution path', async () => {
  await readFile(new URL('../src/opzava/modules/content/providers/keyword-research-execution.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/providers/keyword-research-execution.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /runKeywordResearchProviderCall/);
});

test('case study records content keyword research execution progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0064-content-keyword-research-execution.md', import.meta.url), 'utf8');

  assert.match(readme, /0064-content-keyword-research-execution\.md/);
  assert.match(entry, /^# 0064: Content Keyword Research Execution/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /executeProviderAdapterWithEvents/);
  assert.match(entry, /CostEvent/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content source capture provider adapter and execution route through the platform path', async () => {
  await readFile(new URL('../src/opzava/modules/content/providers/source-capture-adapter.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/providers/source-capture-execution.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createMockSourceCaptureProviderAdapter/);
  assert.match(contentIndex, /runSourceCaptureProviderCall/);
});

test('case study records content source capture provider integration progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0065-content-source-capture-provider-integration.md', import.meta.url), 'utf8');

  assert.match(readme, /0065-content-source-capture-provider-integration\.md/);
  assert.match(entry, /^# 0065: Content Source Capture Provider Integration/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /ProviderAdapter/);
  assert.match(entry, /external-call/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content article draft provider adapter and execution route through the platform path', async () => {
  await readFile(new URL('../src/opzava/modules/content/providers/article-draft-adapter.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/providers/article-draft-execution.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createMockArticleDraftProviderAdapter/);
  assert.match(contentIndex, /runArticleDraftProviderCall/);
});

test('case study records content article draft provider integration progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0066-content-article-draft-provider-integration.md', import.meta.url), 'utf8');

  assert.match(readme, /0066-content-article-draft-provider-integration\.md/);
  assert.match(entry, /^# 0066: Content Article Draft Provider Integration/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /ProviderAdapter/);
  assert.match(entry, /external-call/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content fact check provider adapter and execution route through the platform path', async () => {
  await readFile(new URL('../src/opzava/modules/content/providers/fact-check-adapter.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/providers/fact-check-execution.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createMockFactCheckProviderAdapter/);
  assert.match(contentIndex, /runFactCheckProviderCall/);
});

test('case study records content fact check provider integration progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0067-content-fact-check-provider-integration.md', import.meta.url), 'utf8');

  assert.match(readme, /0067-content-fact-check-provider-integration\.md/);
  assert.match(entry, /^# 0067: Content Fact Check Provider Integration/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /ProviderAdapter/);
  assert.match(entry, /external-call/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content workflow recording executor wires the provider boundary into the run', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/content-workflow-recording-executor.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/content-workflow-recording-executor.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /runContentWorkflowWithRecording/);
  assert.match(contentIndex, /createMockContentWorkflowProviderAdapters/);
});

test('case study records content workflow recording executor progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0068-content-workflow-recording-executor.md', import.meta.url), 'utf8');

  assert.match(readme, /0068-content-workflow-recording-executor\.md/);
  assert.match(entry, /^# 0068: Content Workflow Recording Executor/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /runContentWorkflowWithRecording/);
  assert.match(entry, /external-call/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content wordpress publishing adapter and execution route through the platform path', async () => {
  await readFile(new URL('../src/opzava/modules/content/providers/wordpress-publishing-adapter.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/providers/wordpress-publishing-execution.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');

  assert.match(contentIndex, /createMockWordpressPublishingProviderAdapter/);
  assert.match(contentIndex, /runWordpressPublishingCall/);
});

test('case study records content wordpress publishing adapter progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0069-content-wordpress-publishing-adapter.md', import.meta.url), 'utf8');

  assert.match(readme, /0069-content-wordpress-publishing-adapter\.md/);
  assert.match(entry, /^# 0069: Content WordPress Publishing Adapter/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /ProviderAdapter/);
  assert.match(entry, /external-call/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('wordpress connection admin config contract exists with secret redaction', async () => {
  await readFile(new URL('../src/opzava/platform/admin-config/wordpress-connection.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/platform/admin-config/wordpress-connection.test.ts', import.meta.url), 'utf8');
});

test('case study records wordpress connection admin config progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0070-wordpress-connection-admin-config.md', import.meta.url), 'utf8');

  assert.match(readme, /0070-wordpress-connection-admin-config\.md/);
  assert.match(entry, /^# 0070: WordPress Connection Admin Config/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /SecretReference/);
  assert.match(entry, /redact/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('resend connection admin config contract exists with secret redaction', async () => {
  await readFile(new URL('../src/opzava/platform/admin-config/resend-connection.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/platform/admin-config/resend-connection.test.ts', import.meta.url), 'utf8');
});

test('case study records resend connection admin config progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0071-resend-connection-admin-config.md', import.meta.url), 'utf8');

  assert.match(readme, /0071-resend-connection-admin-config\.md/);
  assert.match(entry, /^# 0071: Resend Connection Admin Config/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /SecretReference/);
  assert.match(entry, /redact/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('ard records the email provider and campaign automation decision', async () => {
  const ard = await readFile(new URL('../docs/ard/0004-email-provider-and-campaign-automation.md', import.meta.url), 'utf8');

  assert.match(ard, /^# ARD 0004: Email Provider And Campaign Automation Ownership/m);
  assert.match(ard, /Status: Accepted/);
  assert.match(ard, /Resend/);
  assert.match(ard, /Plunk/);
  assert.match(ard, /## Decision/);
});

test('provider connection settings UI and wizard step exist and secrets are env-provided', async () => {
  const route = await readFile(new URL('../src/app/api/settings/route.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/app/api/settings/route.test.ts', import.meta.url), 'utf8');
  const section = await readFile(new URL('../src/components/settings/provider-connections-section.tsx', import.meta.url), 'utf8');
  await readFile(new URL('../src/components/settings/setup-connections-step.tsx', import.meta.url), 'utf8');
  const setup = await readFile(new URL('../src/app/setup/page.tsx', import.meta.url), 'utf8');

  // The non-secret provider-connection setting keys exist.
  assert.match(route, /wordpress_site_url/);
  assert.match(route, /resend_from_address/);
  // ARD 0008: provider secrets are environment-provided — the settings route does NOT store them.
  assert.doesNotMatch(route, /resend_api_key/);
  assert.doesNotMatch(route, /wordpress_app_password/);
  // The connections UI documents the env-provided secret model instead of pasting secrets.
  assert.match(section, /RESEND_API_KEY/);
  assert.match(section, /WORDPRESS_APP_PASSWORD/);
  // The wizard wires in the connections step.
  assert.match(setup, /SetupConnectionsStep/);
});

test('case study records provider connection settings and wizard progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0072-provider-connection-settings-and-wizard.md', import.meta.url), 'utf8');

  assert.match(readme, /0072-provider-connection-settings-and-wizard\.md/);
  assert.match(entry, /^# 0072: Provider Connection Settings And Wizard Step/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /write-only/);
  assert.match(entry, /wizard/i);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('connection settings resolver bridges saved settings to live connections', async () => {
  await readFile(new URL('../src/opzava/modules/content/providers/connection-settings-resolver.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/providers/connection-settings-resolver.test.ts', import.meta.url), 'utf8');
  const contentIndex = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(contentIndex, /resolveWordpressLiveConnection/);
  assert.match(contentIndex, /resolveResendLiveConnection/);
});

test('case study records connection settings resolver progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0073-connection-settings-resolver.md', import.meta.url), 'utf8');
  assert.match(readme, /0073-connection-settings-resolver\.md/);
  assert.match(entry, /^# 0073: Connection Settings Resolver/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('connection verifier checks saved credentials without throwing', async () => {
  await readFile(new URL('../src/opzava/modules/content/providers/connection-verifier.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/providers/connection-verifier.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /verifyWordpressConnection/);
  assert.match(idx, /verifyResendConnection/);
});

test('case study records connection verifier progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0074-connection-verifier.md', import.meta.url), 'utf8');
  assert.match(readme, /0074-connection-verifier\.md/);
  assert.match(entry, /^# 0074: Connection Verifier/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('live wordpress draft publisher is draft-only and testable', async () => {
  const pub = await readFile(new URL('../src/opzava/modules/content/providers/wordpress-live-publisher.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/providers/wordpress-live-publisher.test.ts', import.meta.url), 'utf8');
  assert.match(pub, /'draft'/);
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /createWordpressDraft/);
});

test('case study records live wordpress draft publisher progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0075-live-wordpress-draft-publisher.md', import.meta.url), 'utf8');
  assert.match(readme, /0075-live-wordpress-draft-publisher\.md/);
  assert.match(entry, /^# 0075: Live WordPress Draft Publisher/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('live resend email sender is injected-http and testable', async () => {
  await readFile(new URL('../src/opzava/modules/content/providers/resend-live-sender.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/providers/resend-live-sender.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /sendResendEmail/);
});

test('case study records live resend email sender progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0076-live-resend-email-sender.md', import.meta.url), 'utf8');
  assert.match(readme, /0076-live-resend-email-sender\.md/);
  assert.match(entry, /^# 0076: Live Resend Email Sender/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('live provider adapters conform to the platform contract', async () => {
  await readFile(new URL('../src/opzava/modules/content/providers/wordpress-live-adapter.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/providers/resend-live-adapter.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /createLiveWordpressProviderAdapter/);
  assert.match(idx, /createLiveResendProviderAdapter/);
});

test('case study records live provider adapters progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0077-live-provider-adapters.md', import.meta.url), 'utf8');
  assert.match(readme, /0077-live-provider-adapters\.md/);
  assert.match(entry, /^# 0077: Live Provider Adapters/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('email campaign workflow gates sends on approval', async () => {
  const wf = await readFile(new URL('../src/opzava/modules/content/workflow/email-campaign.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/email-campaign.test.ts', import.meta.url), 'utf8');
  assert.match(wf, /approvalGranted/);
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /runEmailCampaign/);
});

test('case study records email campaign workflow progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0078-email-campaign-workflow.md', import.meta.url), 'utf8');
  assert.match(readme, /0078-email-campaign-workflow\.md/);
  assert.match(entry, /^# 0078: Email Campaign Workflow/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('resend campaign sender bridges the live adapter to the campaign workflow', async () => {
  await readFile(new URL('../src/opzava/modules/content/providers/resend-campaign-sender.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/providers/resend-campaign-sender.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /createResendCampaignSender/);
});

test('case study records resend campaign sender progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0079-resend-campaign-sender.md', import.meta.url), 'utf8');
  assert.match(readme, /0079-resend-campaign-sender\.md/);
  assert.match(entry, /^# 0079: Resend Campaign Sender/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('campaign scheduler computes deterministic send times', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/campaign-schedule.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/campaign-schedule.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /computeCampaignSchedule/);
});

test('case study records campaign scheduler progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0080-campaign-scheduler.md', import.meta.url), 'utf8');
  assert.match(readme, /0080-campaign-scheduler\.md/);
  assert.match(entry, /^# 0080: Campaign Scheduler/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('campaign audience dedupes recipients', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/campaign-audience.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/campaign-audience.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /parseCampaignAudience/);
});

test('case study records campaign audience progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0081-campaign-audience.md', import.meta.url), 'utf8');
  assert.match(readme, /0081-campaign-audience\.md/);
  assert.match(entry, /^# 0081: Campaign Audience/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('campaign run plan composes schedule and audience approval-gated', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/campaign-run-plan.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/campaign-run-plan.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /planCampaignRun/);
});

test('case study records campaign run plan progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0082-campaign-run-plan.md', import.meta.url), 'utf8');
  assert.match(readme, /0082-campaign-run-plan\.md/);
  assert.match(entry, /^# 0082: Campaign Run Plan/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('campaign send jobs map a run plan to durable runner jobs', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/campaign-send-jobs.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/campaign-send-jobs.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /buildCampaignSendJobs/);
});

test('case study records campaign send jobs progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0083-campaign-send-jobs.md', import.meta.url), 'utf8');
  assert.match(readme, /0083-campaign-send-jobs\.md/);
  assert.match(entry, /^# 0083: Campaign Send Jobs/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('enqueue campaign send jobs dedupes by idempotency key', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/enqueue-campaign-send-jobs.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/enqueue-campaign-send-jobs.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /enqueueCampaignSendJobs/);
});

test('case study records enqueue campaign send jobs progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0084-enqueue-campaign-send-jobs.md', import.meta.url), 'utf8');
  assert.match(readme, /0084-enqueue-campaign-send-jobs\.md/);
  assert.match(entry, /^# 0084: Enqueue Campaign Send Jobs/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('run campaign send composes plan build enqueue exactly-once', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/run-campaign-send.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/run-campaign-send.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /runCampaignSend/);
});

test('case study records run campaign send progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0085-run-campaign-send.md', import.meta.url), 'utf8');
  assert.match(readme, /0085-run-campaign-send\.md/);
  assert.match(entry, /^# 0085: Run Campaign Send/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('run campaign send binds the real runner repository in one transaction', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/run-campaign-send-with-repository.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/run-campaign-send-with-repository.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /runCampaignSendWithRepository/);
});

test('case study records run campaign send with repository progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0086-run-campaign-send-with-repository.md', import.meta.url), 'utf8');
  assert.match(readme, /0086-run-campaign-send-with-repository\.md/);
  assert.match(entry, /^# 0086: Run Campaign Send With Repository/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('campaign send executor consumes jobs and sends via the sender', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/campaign-send-executor.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/campaign-send-executor.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /createCampaignSendExecutor/);
});

test('case study records campaign send executor progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0087-campaign-send-executor.md', import.meta.url), 'utf8');
  assert.match(readme, /0087-campaign-send-executor\.md/);
  assert.match(entry, /^# 0087: Campaign Send Executor/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('job kind executor routes jobs to per-kind executors', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/job-kind-executor.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/job-kind-executor.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /createJobKindExecutor/);
});

test('case study records job kind executor progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0088-job-kind-executor.md', import.meta.url), 'utf8');
  assert.match(readme, /0088-job-kind-executor\.md/);
  assert.match(entry, /^# 0088: Job Kind Executor/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('campaign runner worker wires the end-to-end durable send loop', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/campaign-runner-worker.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/campaign-runner-worker.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /createCampaignRunnerWorker/);
});

test('case study records campaign runner worker progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0089-campaign-runner-worker.md', import.meta.url), 'utf8');
  assert.match(readme, /0089-campaign-runner-worker\.md/);
  assert.match(entry, /^# 0089: Campaign Runner Worker/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('campaign aggregate enforces a status state machine', async () => {
  await readFile(new URL('../src/opzava/modules/content/campaign/campaign.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/campaign/campaign.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /parseCampaign/);
  assert.match(idx, /transitionCampaign/);
});

test('case study records campaign aggregate progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0090-campaign-aggregate.md', import.meta.url), 'utf8');
  assert.match(readme, /0090-campaign-aggregate\.md/);
  assert.match(entry, /^# 0090: Campaign Aggregate/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('campaign repository persists campaigns in sqlite', async () => {
  await readFile(new URL('../src/opzava/modules/content/campaign/campaign-repository.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/campaign/campaign-repository.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /createCampaignRepository/);
});

test('case study records campaign repository progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0091-campaign-repository.md', import.meta.url), 'utf8');
  assert.match(readme, /0091-campaign-repository\.md/);
  assert.match(entry, /^# 0091: Campaign Repository/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('campaign api routes expose list create-draft and approve', async () => {
  await readFile(new URL('../src/app/api/campaigns/route.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/app/api/campaigns/[id]/approve/route.ts', import.meta.url), 'utf8');
  const route = await readFile(new URL('../src/app/api/campaigns/route.ts', import.meta.url), 'utf8');
  assert.match(route, /createCampaignRepository/);
  assert.match(route, /parseCampaign/);
});

test('case study records campaign api routes progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0092-campaign-api-routes.md', import.meta.url), 'utf8');
  assert.match(readme, /0092-campaign-api-routes\.md/);
  assert.match(entry, /^# 0092: Campaign API Routes/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('campaigns compose-approve UI panel is wired into nav and router', async () => {
  await readFile(new URL('../src/components/panels/campaigns-panel.tsx', import.meta.url), 'utf8');
  const nav = await readFile(new URL('../src/components/layout/nav-rail.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/app/[[...panel]]/page.tsx', import.meta.url), 'utf8');
  assert.match(nav, /id: 'campaigns'/);
  assert.match(page, /case 'campaigns'/);
  assert.match(page, /CampaignsPanel/);
});

test('case study records campaigns ui progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0093-campaigns-ui.md', import.meta.url), 'utf8');
  assert.match(readme, /0093-campaigns-ui\.md/);
  assert.match(entry, /^# 0093: Campaigns Compose And Approve UI/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('run approved campaign drives sending and final status', async () => {
  await readFile(new URL('../src/opzava/modules/content/campaign/run-approved-campaign.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/campaign/run-approved-campaign.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /runApprovedCampaign/);
});

test('case study records run approved campaign progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0094-run-approved-campaign.md', import.meta.url), 'utf8');
  assert.match(readme, /0094-run-approved-campaign\.md/);
  assert.match(entry, /^# 0094: Run Approved Campaign/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('campaign run route sends an approved campaign via resend', async () => {
  const route = await readFile(new URL('../src/app/api/campaigns/[id]/run/route.ts', import.meta.url), 'utf8');
  assert.match(route, /runApprovedCampaign/);
  // ARD 0008: the Resend API key resolves from the environment through the SecretReference
  // boundary, never cleartext from the settings table.
  assert.match(route, /resolveResendCampaignConnection/);
  assert.match(route, /createEnvSecretResolver/);
  assert.doesNotMatch(route, /resend_api_key/);
  const panel = await readFile(new URL('../src/components/panels/campaigns-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /campaigns\/\$\{id\}\/run/);
  assert.match(panel, /onRun/);
});

test('case study records campaign run route progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0095-campaign-run-route.md', import.meta.url), 'utf8');
  assert.match(readme, /0095-campaign-run-route\.md/);
  assert.match(entry, /^# 0095: Campaign Run Route/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('campaign worker daemon drains continuously with injected sleep', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/campaign-worker-daemon.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/campaign-worker-daemon.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /createCampaignWorkerDaemon/);
});

test('case study records campaign worker daemon progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0096-campaign-worker-daemon.md', import.meta.url), 'utf8');
  assert.match(readme, /0096-campaign-worker-daemon\.md/);
  assert.match(entry, /^# 0096: Campaign Worker Daemon/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('architecture entropy guard checks cycles and layering', async () => {
  const t = await readFile(new URL('../src/opzava/architecture.test.ts', import.meta.url), 'utf8');
  assert.match(t, /no import cycles/);
  assert.match(t, /platform/);
  assert.match(t, /modules\/content/);
});

test('case study records architecture entropy guard progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0097-architecture-entropy-guard.md', import.meta.url), 'utf8');
  assert.match(readme, /0097-architecture-entropy-guard\.md/);
  assert.match(entry, /^# 0097: Architecture Entropy Guard/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('dead letter read model lists recent failures globally', async () => {
  await readFile(new URL('../src/opzava/platform/runner/dead-letter-queries.ts', import.meta.url), 'utf8');
  const q = await readFile(new URL('../src/opzava/platform/runner/dead-letter-queries.ts', import.meta.url), 'utf8');
  assert.match(q, /listRecentDeadLetters/);
  assert.match(q, /ORDER BY stored_at DESC/);
});

test('case study records dead letter read model progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0098-dead-letter-read-model.md', import.meta.url), 'utf8');
  assert.match(readme, /0098-dead-letter-read-model\.md/);
  assert.match(entry, /^# 0098: Dead Letter Read Model/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('ops dead-letters route lists failures admin-only', async () => {
  const route = await readFile(new URL('../src/app/api/ops/dead-letters/route.ts', import.meta.url), 'utf8');
  assert.match(route, /listRecentDeadLetters/);
  assert.match(route, /requireRole/);
});

test('case study records ops dead-letters route progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0099-ops-dead-letters-route.md', import.meta.url), 'utf8');
  assert.match(readme, /0099-ops-dead-letters-route\.md/);
  assert.match(entry, /^# 0099: Ops Dead Letters Route/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('ops failures panel is wired into nav and router', async () => {
  await readFile(new URL('../src/components/panels/ops-failures-panel.tsx', import.meta.url), 'utf8');
  const nav = await readFile(new URL('../src/components/layout/nav-rail.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/app/[[...panel]]/page.tsx', import.meta.url), 'utf8');
  assert.match(nav, /id: 'failures'/);
  assert.match(page, /case 'failures'/);
  assert.match(page, /OpsFailuresPanel/);
});

test('case study records ops failures panel progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0100-ops-failures-panel.md', import.meta.url), 'utf8');
  assert.match(readme, /0100-ops-failures-panel\.md/);
  assert.match(entry, /^# 0100: Ops Failures Panel/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('cost read model lists and summarizes recent cost events', async () => {
  const q = await readFile(new URL('../src/opzava/platform/runner/cost-queries.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/platform/runner/cost-queries.test.ts', import.meta.url), 'utf8');
  assert.match(q, /listRecentCostEvents/);
  assert.match(q, /summarizeCostEvents/);
  assert.match(q, /kind = 'cost'/);
});

test('case study records cost read model progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0101-cost-read-model.md', import.meta.url), 'utf8');
  assert.match(readme, /0101-cost-read-model\.md/);
  assert.match(entry, /^# 0101: Cost Read Model/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('ops costs route lists cost events with a summary', async () => {
  const route = await readFile(new URL('../src/app/api/ops/costs/route.ts', import.meta.url), 'utf8');
  assert.match(route, /listRecentCostEvents/);
  assert.match(route, /summarizeCostEvents/);
  assert.match(route, /requireRole/);
});

test('case study records ops costs route progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0102-ops-costs-route.md', import.meta.url), 'utf8');
  assert.match(readme, /0102-ops-costs-route\.md/);
  assert.match(entry, /^# 0102: Ops Costs Route/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('ops costs panel is wired into nav and router', async () => {
  await readFile(new URL('../src/components/panels/ops-costs-panel.tsx', import.meta.url), 'utf8');
  const nav = await readFile(new URL('../src/components/layout/nav-rail.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/app/[[...panel]]/page.tsx', import.meta.url), 'utf8');
  assert.match(nav, /id: 'costs'/);
  assert.match(page, /case 'costs'/);
  assert.match(page, /OpsCostsPanel/);
});

test('case study records ops costs panel progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0103-ops-costs-panel.md', import.meta.url), 'utf8');
  assert.match(readme, /0103-ops-costs-panel\.md/);
  assert.match(entry, /^# 0103: Ops Costs Panel/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('approval repository persists approvals in sqlite', async () => {
  const r = await readFile(new URL('../src/opzava/core/approvals/approval-repository.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/core/approvals/approval-repository.test.ts', import.meta.url), 'utf8');
  assert.match(r, /createApprovalRepository/);
  assert.match(r, /opzava_approvals/);
});

test('case study records approval repository progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0104-approval-repository.md', import.meta.url), 'utf8');
  assert.match(readme, /0104-approval-repository\.md/);
  assert.match(entry, /^# 0104: Approval Repository/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('ops approvals route lists approvals admin-only', async () => {
  const route = await readFile(new URL('../src/app/api/ops/approvals/route.ts', import.meta.url), 'utf8');
  assert.match(route, /createApprovalRepository/);
  assert.match(route, /requireRole/);
});

test('case study records ops approvals route progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0105-ops-approvals-route.md', import.meta.url), 'utf8');
  assert.match(readme, /0105-ops-approvals-route\.md/);
  assert.match(entry, /^# 0105: Ops Approvals Route/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('approval queue panel is wired into nav and router', async () => {
  await readFile(new URL('../src/components/panels/approval-queue-panel.tsx', import.meta.url), 'utf8');
  const nav = await readFile(new URL('../src/components/layout/nav-rail.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/app/[[...panel]]/page.tsx', import.meta.url), 'utf8');
  assert.match(nav, /id: 'approval-queue'/);
  assert.match(page, /case 'approval-queue'/);
  assert.match(page, /ApprovalQueuePanel/);
});

test('case study records approval queue panel progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0106-approval-queue-panel.md', import.meta.url), 'utf8');
  assert.match(readme, /0106-approval-queue-panel\.md/);
  assert.match(entry, /^# 0106: Approval Queue Panel/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('run read model aggregates recent workflow runs', async () => {
  const q = await readFile(new URL('../src/opzava/platform/runner/run-queries.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/platform/runner/run-queries.test.ts', import.meta.url), 'utf8');
  assert.match(q, /listRecentWorkflowRuns/);
  assert.match(q, /GROUP BY workflow_run_id/);
});

test('case study records run read model progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0107-run-read-model.md', import.meta.url), 'utf8');
  assert.match(readme, /0107-run-read-model\.md/);
  assert.match(entry, /^# 0107: Run Read Model/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('ops runs route lists recent run summaries admin-only', async () => {
  const route = await readFile(new URL('../src/app/api/ops/runs/route.ts', import.meta.url), 'utf8');
  assert.match(route, /listRecentWorkflowRuns/);
  assert.match(route, /requireRole/);
});

test('case study records ops runs route progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0108-ops-runs-route.md', import.meta.url), 'utf8');
  assert.match(readme, /0108-ops-runs-route\.md/);
  assert.match(entry, /^# 0108: Ops Runs Route/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('content runs panel is wired into nav and router', async () => {
  await readFile(new URL('../src/components/panels/content-runs-panel.tsx', import.meta.url), 'utf8');
  const nav = await readFile(new URL('../src/components/layout/nav-rail.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/app/[[...panel]]/page.tsx', import.meta.url), 'utf8');
  assert.match(nav, /id: 'content-runs'/);
  assert.match(page, /case 'content-runs'/);
  assert.match(page, /ContentRunsPanel/);
});

test('case study records content runs panel progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0109-content-runs-panel.md', import.meta.url), 'utf8');
  assert.match(readme, /0109-content-runs-panel\.md/);
  assert.match(entry, /^# 0109: Content Runs Panel/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('approval decide route approves or rejects via the state machine', async () => {
  const route = await readFile(new URL('../src/app/api/ops/approvals/[id]/decide/route.ts', import.meta.url), 'utf8');
  assert.match(route, /transitionApprovalStatus/);
  assert.match(route, /requireRole/);
});

test('case study records approval decide route progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0110-approval-decide-route.md', import.meta.url), 'utf8');
  assert.match(readme, /0110-approval-decide-route\.md/);
  assert.match(entry, /^# 0110: Approval Decide Route/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('approval queue panel wires approve/reject decide actions', async () => {
  const panel = await readFile(new URL('../src/components/panels/approval-queue-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /approvals\/\$\{id\}\/decide/);
  assert.match(panel, /onDecide/);
  assert.match(panel, /Approve/);
  assert.match(panel, /Reject/);
});

test('case study records approval decide ui progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0111-approval-decide-ui.md', import.meta.url), 'utf8');
  assert.match(readme, /0111-approval-decide-ui\.md/);
  assert.match(entry, /^# 0111: Approval Decide UI/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records campaign daemon runtime progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0112-campaign-daemon-runtime.md', import.meta.url), 'utf8');
  assert.match(readme, /0112-campaign-daemon-runtime\.md/);
  assert.match(entry, /^# 0112: Campaign Daemon Runtime/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('runner retention prunes old terminal rows', async () => {
  const r = await readFile(new URL('../src/opzava/platform/runner/retention.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/platform/runner/retention.test.ts', import.meta.url), 'utf8');
  assert.match(r, /pruneRunnerData/);
  assert.match(r, /status = 'succeeded'/);
});

test('case study records runner retention progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0113-runner-retention.md', import.meta.url), 'utf8');
  assert.match(readme, /0113-runner-retention\.md/);
  assert.match(entry, /^# 0113: Runner Retention/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('maintenance prune route prunes via retention admin-only', async () => {
  const route = await readFile(new URL('../src/app/api/ops/maintenance/prune/route.ts', import.meta.url), 'utf8');
  assert.match(route, /pruneRunnerData/);
  assert.match(route, /requireRole/);
});

test('case study records maintenance prune route progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0114-maintenance-prune-route.md', import.meta.url), 'utf8');
  assert.match(readme, /0114-maintenance-prune-route\.md/);
  assert.match(entry, /^# 0114: Maintenance Prune Route/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('maintenance panel is wired into nav and router', async () => {
  await readFile(new URL('../src/components/panels/maintenance-panel.tsx', import.meta.url), 'utf8');
  const nav = await readFile(new URL('../src/components/layout/nav-rail.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/app/[[...panel]]/page.tsx', import.meta.url), 'utf8');
  assert.match(nav, /id: 'maintenance'/);
  assert.match(page, /case 'maintenance'/);
  assert.match(page, /MaintenancePanel/);
});

test('case study records maintenance panel progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0115-maintenance-panel.md', import.meta.url), 'utf8');
  assert.match(readme, /0115-maintenance-panel\.md/);
  assert.match(entry, /^# 0115: Maintenance Panel/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('artifact repository persists content artifacts in sqlite', async () => {
  const r = await readFile(new URL('../src/opzava/modules/content/artifacts/artifact-repository.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/artifacts/artifact-repository.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(r, /opzava_content_artifacts/);
  assert.match(idx, /createArtifactRepository/);
});

test('case study records artifact repository progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0116-artifact-repository.md', import.meta.url), 'utf8');
  assert.match(readme, /0116-artifact-repository\.md/);
  assert.match(entry, /^# 0116: Artifact Repository/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('ops artifacts list route returns summaries admin-only', async () => {
  const route = await readFile(new URL('../src/app/api/ops/artifacts/route.ts', import.meta.url), 'utf8');
  assert.match(route, /createArtifactRepository/);
  assert.match(route, /requireRole/);
});

test('case study records ops artifacts list route progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0117-ops-artifacts-route.md', import.meta.url), 'utf8');
  assert.match(readme, /0117-ops-artifacts-route\.md/);
  assert.match(entry, /^# 0117: Ops Artifacts Route/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('ops artifact detail route returns the full artifact', async () => {
  const route = await readFile(new URL('../src/app/api/ops/artifacts/[id]/route.ts', import.meta.url), 'utf8');
  assert.match(route, /getArtifactById/);
  assert.match(route, /Artifact not found/);
});

test('case study records ops artifact detail route progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0118-ops-artifact-detail-route.md', import.meta.url), 'utf8');
  assert.match(readme, /0118-ops-artifact-detail-route\.md/);
  assert.match(entry, /^# 0118: Ops Artifact Detail Route/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('artifacts panel is wired into nav and router', async () => {
  await readFile(new URL('../src/components/panels/artifacts-panel.tsx', import.meta.url), 'utf8');
  const nav = await readFile(new URL('../src/components/layout/nav-rail.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/app/[[...panel]]/page.tsx', import.meta.url), 'utf8');
  assert.match(nav, /id: 'artifacts'/);
  assert.match(page, /case 'artifacts'/);
  assert.match(page, /ArtifactsPanel/);
});

test('case study records artifacts panel progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0119-artifacts-panel.md', import.meta.url), 'utf8');
  assert.match(readme, /0119-artifacts-panel\.md/);
  assert.match(entry, /^# 0119: Artifacts Panel/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('record workflow artifacts extracts produced artifacts to a sink', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/record-workflow-artifacts.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/record-workflow-artifacts.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /recordContentWorkflowArtifacts/);
});

test('case study records workflow artifact recording progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0120-record-workflow-artifacts.md', import.meta.url), 'utf8');
  assert.match(readme, /0120-record-workflow-artifacts\.md/);
  assert.match(entry, /^# 0120: Record Workflow Artifacts/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('run-and-record content workflow persists artifacts to the repo', async () => {
  await readFile(new URL('../src/opzava/modules/content/workflow/run-and-record-content-workflow.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/content/workflow/run-and-record-content-workflow.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/content/index.ts', import.meta.url), 'utf8');
  assert.match(idx, /runAndRecordContentWorkflow/);
});

test('case study records run-and-record content workflow progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0121-run-and-record-content-workflow.md', import.meta.url), 'utf8');
  assert.match(readme, /0121-run-and-record-content-workflow\.md/);
  assert.match(entry, /^# 0121: Run And Record Content Workflow/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('agent role contract defines the virtual-company roster', async () => {
  const c = await readFile(new URL('../src/opzava/modules/team/agent-role.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/team/agent-role.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/team/index.ts', import.meta.url), 'utf8');
  assert.match(c, /DEFAULT_AGENT_ROLES/);
  assert.match(c, /groupAgentRolesByDepartment/);
  assert.match(idx, /parseAgentRole/);
});

test('case study records agent role contract progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0122-agent-role-contract.md', import.meta.url), 'utf8');
  assert.match(readme, /0122-agent-role-contract\.md/);
  assert.match(entry, /^# 0122: Agent Role Contract/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('agent role repository persists and seeds the roster', async () => {
  const r = await readFile(new URL('../src/opzava/modules/team/agent-role-repository.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/team/agent-role-repository.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/team/index.ts', import.meta.url), 'utf8');
  assert.match(r, /opzava_agent_roles/);
  assert.match(r, /seedDefaults/);
  assert.match(idx, /createAgentRoleRepository/);
});

test('case study records agent role repository progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0123-agent-role-repository.md', import.meta.url), 'utf8');
  assert.match(readme, /0123-agent-role-repository\.md/);
  assert.match(entry, /^# 0123: Agent Role Repository/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('team agents route returns the roster grouped by department', async () => {
  const route = await readFile(new URL('../src/app/api/team/agents/route.ts', import.meta.url), 'utf8');
  assert.match(route, /createAgentRoleRepository/);
  assert.match(route, /groupAgentRolesByDepartment/);
  assert.match(route, /seedDefaults/);
});

test('case study records team agents route progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0124-team-agents-route.md', import.meta.url), 'utf8');
  assert.match(readme, /0124-team-agents-route\.md/);
  assert.match(entry, /^# 0124: Team Agents Route/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('team dashboard panel is wired into nav and router', async () => {
  await readFile(new URL('../src/components/panels/team-dashboard-panel.tsx', import.meta.url), 'utf8');
  const nav = await readFile(new URL('../src/components/layout/nav-rail.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/app/[[...panel]]/page.tsx', import.meta.url), 'utf8');
  assert.match(nav, /id: 'team'/);
  assert.match(page, /case 'team'/);
  assert.match(page, /TeamDashboardPanel/);
  const panel = await readFile(new URL('../src/components/panels/team-dashboard-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /artifactCount/);
  assert.match(panel, /team\/agents\/\$\{agentId\}/);
  assert.match(panel, /onToggle/);
  assert.match(panel, /DepartmentPipeline/);
  assert.match(panel, /avatarEmoji/);
  assert.match(panel, /charter/);
  assert.match(panel, /preferredModel/);
});

test('case study records department pipeline view progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0134-department-pipeline-view.md', import.meta.url), 'utf8');
  assert.match(readme, /0134-department-pipeline-view\.md/);
  assert.match(entry, /^# 0134: Department Pipeline View/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('eslint config has a complexity ratchet for opzava core', async () => {
  const cfg = await readFile(new URL('../eslint.config.mjs', import.meta.url), 'utf8');
  assert.match(cfg, /src\/opzava\/\*\*\/\*\.ts/);
  assert.match(cfg, /complexity/);
  assert.match(cfg, /max-depth/);
});

test('case study records complexity ratchet progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0135-complexity-ratchet.md', import.meta.url), 'utf8');
  assert.match(readme, /0135-complexity-ratchet\.md/);
  assert.match(entry, /^# 0135: Complexity Ratchet/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('ard 0005 records the first R&D queue as complete', async () => {
  const ard = await readFile(new URL('../docs/ard/0005-first-rnd-queue-complete.md', import.meta.url), 'utf8');
  assert.match(ard, /^# ARD 0005: First R&D Queue Complete/m);
  assert.match(ard, /## Next R&D Queue/);
  assert.match(ard, /## Status/);
});

test('social artifact envelope starts the social media department', async () => {
  const a = await readFile(new URL('../src/opzava/modules/social/artifacts/social-artifact.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/social/artifacts/social-artifact.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/social/index.ts', import.meta.url), 'utf8');
  assert.match(a, /SOCIAL_ARTIFACT_TYPES/);
  assert.match(a, /social-post-draft/);
  assert.match(idx, /createSocialArtifact/);
});

test('social post draft step produces a social artifact from a brief', async () => {
  const a = await readFile(new URL('../src/opzava/modules/social/steps/social-post-draft-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/social/steps/social-post-draft-service.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/social/index.ts', import.meta.url), 'utf8');
  assert.match(a, /createSocialPostDraftStepService/);
  assert.match(a, /social-post-draft/);
  assert.match(idx, /createSocialPostDraftStepService/);
});

test('case study records social post draft step progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0138-social-post-draft-step.md', import.meta.url), 'utf8');
  assert.match(readme, /0138-social-post-draft-step\.md/);
  assert.match(entry, /^# 0138: Social Post Draft Step/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('social media department is activated on the roster and pipeline', async () => {
  const roles = await readFile(new URL('../src/opzava/modules/team/agent-role.ts', import.meta.url), 'utf8');
  const pipe = await readFile(new URL('../src/opzava/modules/team/department-pipeline.ts', import.meta.url), 'utf8');
  assert.match(roles, /'social-media-manager'/);
  assert.match(pipe, /SOCIAL_PIPELINE_ORDER/);
  assert.match(pipe, /'Social Media': SOCIAL_PIPELINE_ORDER/);
});

test('case study records social department activation progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0139-social-department-activation.md', import.meta.url), 'utf8');
  assert.match(readme, /0139-social-department-activation\.md/);
  assert.match(entry, /^# 0139: Social Department Activation/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('social review quality gate enforces pass/reject', async () => {
  const a = await readFile(new URL('../src/opzava/modules/social/steps/social-review-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/social/steps/social-review-service.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/social/index.ts', import.meta.url), 'utf8');
  assert.match(a, /assertSocialReviewVerdict/);
  assert.match(a, /social-review/);
  assert.match(idx, /createSocialReviewStepService/);
});

test('case study records social review step progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0140-social-review-step.md', import.meta.url), 'utf8');
  assert.match(readme, /0140-social-review-step\.md/);
  assert.match(entry, /^# 0140: Social Review Step/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('social approval step produces a human approval not an artifact', async () => {
  const a = await readFile(new URL('../src/opzava/modules/social/steps/social-approval-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/social/steps/social-approval-service.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/social/index.ts', import.meta.url), 'utf8');
  assert.match(a, /parseApproval/);
  assert.match(a, /social-publish/);
  assert.match(idx, /createSocialApprovalStepService/);
});

test('case study records social approval step progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0141-social-approval-step.md', import.meta.url), 'utf8');
  assert.match(readme, /0141-social-approval-step\.md/);
  assert.match(entry, /^# 0141: Social Approval Step/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('social schedule request is draft-only and approval-gated', async () => {
  const a = await readFile(new URL('../src/opzava/modules/social/steps/social-schedule-request-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/social/steps/social-schedule-request-service.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/social/index.ts', import.meta.url), 'utf8');
  assert.match(a, /social-schedule-request/);
  assert.match(a, /requires a granted approval/);
  assert.doesNotMatch(a, /'published'/);
  assert.match(idx, /createSocialScheduleRequestStepService/);
});

test('case study records social schedule request step progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0142-social-schedule-request-step.md', import.meta.url), 'utf8');
  assert.match(readme, /0142-social-schedule-request-step\.md/);
  assert.match(entry, /^# 0142: Social Schedule Request Step/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('social pipeline steps all have owning agents', async () => {
  const roles = await readFile(new URL('../src/opzava/modules/team/agent-role.ts', import.meta.url), 'utf8');
  assert.match(roles, /'social-reviewer'/);
  assert.match(roles, /'social-brief', 'social-post-draft', 'social-schedule-request'/);
});

test('general va department envelope and first step exist', async () => {
  const env = await readFile(new URL('../src/opzava/modules/general-va/artifacts/general-va-artifact.ts', import.meta.url), 'utf8');
  const step = await readFile(new URL('../src/opzava/modules/general-va/steps/va-task-draft-service.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/general-va/index.ts', import.meta.url), 'utf8');
  assert.match(env, /GENERAL_VA_ARTIFACT_TYPES/);
  assert.match(step, /createVaTaskDraftStepService/);
  assert.match(idx, /createGeneralVaArtifact/);
  assert.match(idx, /createVaTaskDraftStepService/);
});

test('general va department is activated on roster and pipeline', async () => {
  const roles = await readFile(new URL('../src/opzava/modules/team/agent-role.ts', import.meta.url), 'utf8');
  const pipe = await readFile(new URL('../src/opzava/modules/team/department-pipeline.ts', import.meta.url), 'utf8');
  assert.match(roles, /'va-task-intake', 'va-task-draft'/);
  assert.match(pipe, /'General VA': GENERAL_VA_PIPELINE_ORDER/);
});

test('agent profiles give every agent a persona identity', async () => {
  const a = await readFile(new URL('../src/opzava/modules/team/agent-profile.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/team/agent-profile.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/team/index.ts', import.meta.url), 'utf8');
  assert.match(a, /DEFAULT_AGENT_PROFILES/);
  assert.match(a, /avatarEmoji/);
  assert.match(a, /charter/);
  assert.match(idx, /getAgentProfile/);
});

test('team agents route merges persona profiles', async () => {
  const route = await readFile(new URL('../src/app/api/team/agents/route.ts', import.meta.url), 'utf8');
  assert.match(route, /getAgentProfile/);
  assert.match(route, /displayName/);
  assert.match(route, /avatarEmoji/);
  assert.match(route, /lastActiveAt/);
});

test('team dashboard agent card shows last active', async () => {
  const panel = await readFile(new URL('../src/components/panels/team-dashboard-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /lastActiveAt/);
});

test('general va review gate and postgres ARD exist', async () => {
  const a = await readFile(new URL('../src/opzava/modules/general-va/steps/va-task-review-service.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/general-va/index.ts', import.meta.url), 'utf8');
  const ard = await readFile(new URL('../docs/ard/0006-postgres-compatibility.md', import.meta.url), 'utf8');
  assert.match(a, /assertVaTaskReviewVerdict/);
  assert.match(idx, /createVaTaskReviewStepService/);
  assert.match(ard, /^# ARD 0006: Postgres Compatibility/m);
});

test('general va human approval gate completes the dept workflow', async () => {
  const a = await readFile(new URL('../src/opzava/modules/general-va/steps/va-approval-service.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/general-va/steps/va-approval-service.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/general-va/index.ts', import.meta.url), 'utf8');
  assert.match(a, /parseApproval/);
  assert.match(a, /va-task-complete/);
  assert.match(idx, /createVaApprovalStepService/);
});

test('case study records va approval step progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0154-va-approval-step.md', import.meta.url), 'utf8');
  assert.match(readme, /0154-va-approval-step\.md/);
  assert.match(entry, /^# 0154: VA Approval Step/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records general va review progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0153-va-task-review.md', import.meta.url), 'utf8');
  assert.match(readme, /0153-va-task-review\.md/);
  assert.match(entry, /^# 0153: VA Task Review/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('artifact repository exposes column summaries with createdAt', async () => {
  const r = await readFile(new URL('../src/opzava/modules/content/artifacts/artifact-repository.ts', import.meta.url), 'utf8');
  assert.match(r, /listArtifactSummaries/);
  assert.match(r, /ArtifactSummary/);
});

test('agent activity computes last active timestamp', async () => {
  const a = await readFile(new URL('../src/opzava/modules/team/agent-activity.ts', import.meta.url), 'utf8');
  assert.match(a, /lastActiveAt/);
  assert.match(a, /listArtifactSummaries/);
});

test('case study records agent last-active progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0151-agent-last-active.md', import.meta.url), 'utf8');
  assert.match(readme, /0151-agent-last-active\.md/);
  assert.match(entry, /^# 0151: Agent Last Active/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records artifact summaries progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0150-artifact-summaries.md', import.meta.url), 'utf8');
  assert.match(readme, /0150-artifact-summaries\.md/);
  assert.match(entry, /^# 0150: Artifact Summaries/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records agent profile progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0147-agent-profiles.md', import.meta.url), 'utf8');
  assert.match(readme, /0147-agent-profiles\.md/);
  assert.match(entry, /^# 0147: Agent Profiles/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records general va activation progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0146-general-va-activation.md', import.meta.url), 'utf8');
  assert.match(readme, /0146-general-va-activation\.md/);
  assert.match(entry, /^# 0146: General VA Activation/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records general va department start progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0144-general-va-department.md', import.meta.url), 'utf8');
  assert.match(readme, /0144-general-va-department\.md/);
  assert.match(entry, /^# 0144: General VA Department/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records social pipeline ownership progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0143-social-pipeline-ownership.md', import.meta.url), 'utf8');
  assert.match(readme, /0143-social-pipeline-ownership\.md/);
  assert.match(entry, /^# 0143: Social Pipeline Ownership/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records social artifact envelope progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0137-social-artifact-envelope.md', import.meta.url), 'utf8');
  assert.match(readme, /0137-social-artifact-envelope\.md/);
  assert.match(entry, /^# 0137: Social Artifact Envelope/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records team dashboard panel progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0125-team-dashboard-panel.md', import.meta.url), 'utf8');
  assert.match(readme, /0125-team-dashboard-panel\.md/);
  assert.match(entry, /^# 0125: Team Dashboard Panel/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('agent activity attributes artifacts to the owning agents', async () => {
  const a = await readFile(new URL('../src/opzava/modules/team/agent-activity.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/team/agent-activity.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/team/index.ts', import.meta.url), 'utf8');
  assert.match(a, /summarizeAgentActivity/);
  assert.match(a, /fact-check-report/);
  assert.match(idx, /summarizeAgentActivity/);
});

test('case study records agent activity progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0126-agent-activity.md', import.meta.url), 'utf8');
  assert.match(readme, /0126-agent-activity\.md/);
  assert.match(entry, /^# 0126: Agent Activity/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('team agents route enriches each agent with activity counts', async () => {
  const route = await readFile(new URL('../src/app/api/team/agents/route.ts', import.meta.url), 'utf8');
  assert.match(route, /summarizeAgentActivity/);
  assert.match(route, /artifactCount/);
});

test('case study records team agents activity enrichment progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0127-team-agents-activity.md', import.meta.url), 'utf8');
  assert.match(readme, /0127-team-agents-activity\.md/);
  assert.match(entry, /^# 0127: Team Agents Activity/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('agent status state machine governs pause/activate', async () => {
  const a = await readFile(new URL('../src/opzava/modules/team/agent-status.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/team/agent-status.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/team/index.ts', import.meta.url), 'utf8');
  assert.match(a, /transitionAgentStatus/);
  assert.match(idx, /transitionAgentStatus/);
});

test('case study records agent status transition progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0129-agent-status-transition.md', import.meta.url), 'utf8');
  assert.match(readme, /0129-agent-status-transition\.md/);
  assert.match(entry, /^# 0129: Agent Status Transition/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('agent patch route pauses and activates agents', async () => {
  const route = await readFile(new URL('../src/app/api/team/agents/[id]/route.ts', import.meta.url), 'utf8');
  assert.match(route, /transitionAgentStatus/);
  assert.match(route, /requireRole/);
});

test('case study records agent patch route progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0130-agent-status-route.md', import.meta.url), 'utf8');
  assert.match(readme, /0130-agent-status-route\.md/);
  assert.match(entry, /^# 0130: Agent Status Route/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('department pipeline orders steps and attributes owners', async () => {
  const a = await readFile(new URL('../src/opzava/modules/team/department-pipeline.ts', import.meta.url), 'utf8');
  await readFile(new URL('../src/opzava/modules/team/department-pipeline.test.ts', import.meta.url), 'utf8');
  const idx = await readFile(new URL('../src/opzava/modules/team/index.ts', import.meta.url), 'utf8');
  assert.match(a, /buildDepartmentPipeline/);
  assert.match(a, /CONTENT_PIPELINE_ORDER/);
  assert.match(idx, /buildDepartmentPipeline/);
});

test('case study records department pipeline progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0132-department-pipeline.md', import.meta.url), 'utf8');
  assert.match(readme, /0132-department-pipeline\.md/);
  assert.match(entry, /^# 0132: Department Pipeline/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('team agents route returns per-department pipelines', async () => {
  const route = await readFile(new URL('../src/app/api/team/agents/route.ts', import.meta.url), 'utf8');
  assert.match(route, /buildDepartmentPipeline/);
  assert.match(route, /pipelines/);
});

test('case study records team pipelines route progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0133-team-pipelines-route.md', import.meta.url), 'utf8');
  assert.match(readme, /0133-team-pipelines-route\.md/);
  assert.match(entry, /^# 0133: Team Pipelines Route/m);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});
