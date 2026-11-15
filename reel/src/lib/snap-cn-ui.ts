export {defaultLightTheme, useSnapCnTheme} from './theme';
export type {SnapCnTheme} from './theme';
// Offline font adapter: the project loads a bundled font before rendering.
export const resolveFont = (_name?: string): string => 'DemoSans';
