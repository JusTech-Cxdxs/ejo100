"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, rel), 'utf8');
(0, node_test_1.test)('leadership and IT overviews: permission-checked, inside the viewer\'s own organisation, counts only', () => {
    const src = read('lib/actions/leadership.ts');
    strict_1.default.match(src, /authorize\('analytics\.business\.view'/);
    strict_1.default.match(src, /authorize\('audit\.view'/);
    // Branches: always the viewer's own organisation (also for the platform team), narrowed to their reach.
    strict_1.default.match(src, /businessUnit: \{ organisationId: org \}/);
    strict_1.default.match(src, /all\.includes\(b\)/);
    // No customer names or message text leave these functions.
    strict_1.default.doesNotMatch(src, /fullName: true|contactName|body: true/);
    const dash = read('app/(app)/dashboard/page.tsx');
    strict_1.default.match(dash, /overviews\.leadership \? <Suspense/);
    strict_1.default.match(dash, /overviews\.it \? <Suspense/);
    strict_1.default.match(read('components/dashboard/LeadershipOverview.tsx'), /figures as of/);
    strict_1.default.match(read('components/dashboard/ItOverview.tsx'), /As of/);
});
