/** media://local/<abs path> URL for a file. Each segment is fully encoded: encodeURI leaves '#' and '?' alone, which the URL parser
 *  then treats as fragment/query and cuts the path short ("Song #1.m4a" would 404 and never play). */
export const mediaUrl = (path: string): string => 'media://local' + path.split('/').map(encodeURIComponent).join('/')
