// Knobs shared by main and renderer.
export const LIBRARY_DIR_NAME = 'Slowverb'          // ~/Music/<this> is the library root; every folder inside it is a playlist
export const IMPORT_MODE: 'copy' | 'move' = 'copy'  // dropping files into a playlist: copy keeps your originals, move relocates them
export const PHONE_DIR_NAME = 'Slowverb Phone'     // folder inside iCloud Drive that the iPhone sees in the Files app
export const CATEGORIES = ['Songs', 'Sound bites', 'White noise'] as const   // every file has ONE home: a top-level folder of the library with one of these names
export const DEFAULT_CATEGORY = 'Songs'
export const LISTS_DIR = '.slowverb'                          // hidden folder in the library root: playlists.json (virtual playlists) + migration log
export const PHONE_LISTS_FILE = 'playlists.json'   // inside the Slowverb Phone folder (visible in Files, so the phone's picker can select it): the playlists + the list of sent files
