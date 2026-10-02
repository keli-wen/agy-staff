// OpenCode V1 plugin. The host discovers commands directly from these skills.
// Keep this module dependency-free and export only plugin initializers: V1's
// loader invokes every export as a plugin.
import { fileURLToPath } from 'node:url';

const bundledSkills = fileURLToPath(new URL('./opencode-skills', import.meta.url));

export const AgyStaffPlugin = async () => ({
  config: async config => {
    config.skills ??= {};
    config.skills.paths ??= [];
    if (!config.skills.paths.includes(bundledSkills)) config.skills.paths.push(bundledSkills);
  },
});
