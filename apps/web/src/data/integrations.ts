import defaultOptionalTags from '../../../../config/integrations/optional-tags.json';
import { parseOptionalTagsConfiguration } from '@lavbe/contracts';

declare global {
  interface ImportMetaEnv { readonly PUBLIC_LAVBE_OPTIONAL_TAGS_JSON?: string; }
}

export const optionalTags = parseOptionalTagsConfiguration(
  import.meta.env.PUBLIC_LAVBE_OPTIONAL_TAGS_JSON ?? JSON.stringify(defaultOptionalTags),
);
