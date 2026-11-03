import { app } from 'electron'
import { join } from 'path'
import { LIBRARY_DIR_NAME } from '../shared/config'
export const libraryRoot = () => process.env.SLOWVERB_ROOT || join(app.getPath('music'), LIBRARY_DIR_NAME)   // env override: test harness only
