const routes: RouteConfig[] = [
  {
    key: 'ParseFile',
    windowOptions: {
      title: '加载下载任务',
    },
    path: '/parse-file',
    createConfig: {
      showTitlebar: false,
      saveWindowBounds: false,
      hideMenus: true,
    },
  },
  {
    key: 'DownloadTask',
    windowOptions: {
      title: '下载任务列表',
    },
    path: '/download-task',
    createConfig: {
      showTitlebar: false,
      saveWindowBounds: false,
      hideMenus: true,
    },
  },
]

export default routes
