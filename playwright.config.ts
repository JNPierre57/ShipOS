import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',workers:1,use:{headless:true,launchOptions:{args:['--autoplay-policy=no-user-gesture-required']}},timeout:30000});
