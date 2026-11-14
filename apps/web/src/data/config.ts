import limits from '../../../../config/limits.json';
import localeRegistry from '../../../../config/locales.json';
import designTokens from '../../../../config/design-tokens.json';
import iconMap from '../../../../config/icon-map.json';
import iconAssets from '../../../../config/icon-assets.json';

export { limits, localeRegistry, designTokens, iconMap, iconAssets };

export function getLocaleDirection(locale: string): 'ltr' | 'rtl' {
  const direction = localeRegistry.locales.find((item) => item.code === locale)?.direction;
  return direction === 'rtl' ? 'rtl' : 'ltr';
}
