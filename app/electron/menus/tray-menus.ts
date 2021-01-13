import { MenuItemConstructorOptions } from 'electron'

export const trayMenus: MenuItemConstructorOptions[] = [
  { label: '主页', click: () => $tools.createWindow('ParseFile') },

  { type: 'separator' },

  { label: 'Quit', role: 'quit' },
]
