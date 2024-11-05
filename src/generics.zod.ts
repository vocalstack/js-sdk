import { z } from 'zod';

export const zUuid = z
  .string()
  .regex(new RegExp('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'), {
    message: 'Invalid UUID',
  });

export type Uuid = z.infer<typeof zUuid>;

export const zUrl = z.string().regex(
  new RegExp(
    '^(https?:\\/\\/)?' + // protocol
      '(localhost|' + // localhost (for local development)
      '(([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
      '(\\d{1,3}\\.){3}\\d{1,3})' + // OR ip (v4) address
      '(\\:\\d+)?' + // port
      '(\\/[-a-z\\d%_.~+:@/]*)*' + // path
      '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
      '(\\#[-a-z\\d_]*)?$', // fragment identifier
    'i',
  ),
  { message: 'Invalid URL' },
);

export const zDuration = z.number().optional();

// prettier-ignore
export const zLanguage = z.enum(['af','am','an','ar','as','az','be','bg','bn','br','bs','ca','cs','cy','da','de','dz','el','en','eo','es','et','eu','fa','fi','fo','fr','ga','gl','gu','he','hi','hr','ht','hu','hy','id','is','it','ja','jv','ka','kk','km','kn','ko','ku','ky','la','lb','lo','lt','lv','mg','mk','ml','mn','mr','ms','mt','nb','ne','nl','nn','no','oc','or','pa','pl','ps','pt','qu','ro','ru','rw','se','si','sk','sl','sq','sr','sv','sw','ta','te','th','tl','tr','ug','uk','ur','vi','vo','wa','xh','zh','zu']);

export type Language = z.infer<typeof zLanguage>;

const zTimelineItem = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
  language: zLanguage.optional(),
  language_probability: z.number().optional(),
  translations: z.record(zLanguage, z.string()).optional(),
  execution_times: z
    .object({ language_detection: z.number().optional(), translation: z.record(zLanguage, z.number()).optional() })
    .optional(),
  temperature: z.number().optional(),
  words: z
    .tuple([
      z.number(), // start
      z.number(), // end
      z.string(), // text
      z.number(), // probability
    ])
    .array()
    .optional(),
});

export type TimelineItem = { start: number; end: number; text: string } & z.infer<typeof zTimelineItem>;

export type Timeline = TimelineItem[];

export const zConfiguration = z.object({
  apiKey: z.string().optional(),
  authToken: z.string().optional(),
  apiServer: z.string().optional(),
  headers: z.record(z.string()).optional(),
});

export type Configuration = z.infer<typeof zConfiguration>;
