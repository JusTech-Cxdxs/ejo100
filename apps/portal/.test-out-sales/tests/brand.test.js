"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** The platform's name lives in one place (packages/enyo/src/brand.ts) and is used everywhere. */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const brand_1 = require("../lib/brand");
const REPO = (0, node_path_1.join)(__dirname, '..', '..', '..', '..');
(0, node_test_1.test)('the brand file is copied unchanged into both apps (npm run brand:sync)', () => {
    const src = (0, node_fs_1.readFileSync)((0, node_path_1.join)(REPO, 'packages/enyo/src/brand.ts'), 'utf8');
    strict_1.default.equal((0, node_fs_1.readFileSync)((0, node_path_1.join)(REPO, 'apps/portal/lib/brand.ts'), 'utf8'), src);
    strict_1.default.equal((0, node_fs_1.readFileSync)((0, node_path_1.join)(REPO, 'apps/website/lib/brand.ts'), 'utf8'), src);
});
(0, node_test_1.test)('no screen, email, print-out or PDF spells the platform name itself', () => {
    const offenders = [];
    const walk = (dir) => {
        for (const f of (0, node_fs_1.readdirSync)(dir)) {
            const p = (0, node_path_1.join)(dir, f);
            if (['node_modules', '.next', '.test-out', 'e2e', 'tests'].includes(f))
                continue;
            if ((0, node_fs_1.statSync)(p).isDirectory()) {
                walk(p);
                continue;
            }
            if (!/\.(ts|tsx)$/.test(f) || /brand\.ts$/.test(f))
                continue;
            const code = (0, node_fs_1.readFileSync)(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
            if (/['"`>]\s*Powered by EJO|EJO 100 Enterprise (Platform|OS)|['"]EJO 100['"]/.test(code))
                offenders.push(p.slice(REPO.length + 1));
        }
    };
    for (const app of ['apps/portal', 'apps/website', 'packages/enyo/src'])
        walk((0, node_path_1.join)(REPO, app));
    strict_1.default.deepEqual(offenders, []);
    strict_1.default.equal(brand_1.PLATFORM.poweredBy, `Powered by ${brand_1.PLATFORM.name}`);
});
(0, node_test_1.test)('the installed app gets a short name: the organisation\'s initials, or the one set', () => {
    strict_1.default.equal((0, brand_1.appShortName)('Kewalram Chanrai Group'), 'KCG');
    strict_1.default.equal((0, brand_1.appShortName)('Acme'), 'Acme');
    strict_1.default.equal((0, brand_1.appShortName)('Bank of the North West Region'), 'BNWR');
    strict_1.default.equal((0, brand_1.appShortName)('Kewalram Chanrai Group', 'Kewalram'), 'Kewalram');
});
(0, node_test_1.test)('dealer brands: a quiet text line in every email footer, in each brand\'s colour; nothing when not set', async () => {
    const { dealerBrands, renderEmailLayout } = await Promise.resolve().then(() => __importStar(require('../lib/email-templates/layout')));
    strict_1.default.deepEqual(dealerBrands('FOTON:#111111, ISUZU:#E4002B,SOUEAST:#F39800'), [
        { name: 'FOTON', color: '#111111' }, { name: 'ISUZU', color: '#E4002B' }, { name: 'SOUEAST', color: '#F39800' },
    ]);
    strict_1.default.deepEqual(dealerBrands('<b>X</b>:red'), [{ name: 'bXb', color: '#334155' }]);
    strict_1.default.deepEqual(dealerBrands(''), []);
    const before = process.env.NEXT_PUBLIC_DEALER_BRANDS;
    process.env.NEXT_PUBLIC_DEALER_BRANDS = 'FOTON:#111111,ISUZU:#E4002B';
    const out = renderEmailLayout({ previewText: 'p', companyName: 'Kewalram Chanrai Group', logoUrl: 'https://x.example/l.png', heading: 'Hi', bodyHtml: 'Body' });
    strict_1.default.match(out, /Authorised dealer/);
    strict_1.default.match(out, /color: #E4002B; font-weight: 800[^>]*>ISUZU</);
    strict_1.default.doesNotMatch(out, /<img[^>]*(foton|isuzu)/i);
    if (before === undefined)
        delete process.env.NEXT_PUBLIC_DEALER_BRANDS;
    else
        process.env.NEXT_PUBLIC_DEALER_BRANDS = before;
});
