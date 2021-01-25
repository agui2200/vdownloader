import Axios from 'axios'
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  createWriteStream,
  readdirSync,
  statSync,
  unlinkSync,
  stat,
} from 'fs'
import { sep } from 'path'

import md5 from 'md5'
import crypto from 'crypto'

console.log('识别系统:' + process.platform)

export const initialState = {
  tasks: [],
  m3uKeyCache: [],
  saveAt: '',
  taskInfo: { downloading: false, canceled: false },
}

export function CANCEL_DOWNLOAD(state: StoreStates, action: StoreAction<'CANCEL_DOWNLOAD'>) {
  state.taskInfo.canceled = true
  state.tasks.map((t) => {
    t.status = taskStatus.none
  })
}

export function CLEAR_CACHE(state: StoreStates, action: StoreAction<'CLEAR_CACHE'>) {
  $tools.log.info('CLEAR_CACHE')
  const emptyDir = function (dir: string) {
    const files = readdirSync(dir) //读取该文件夹
    files.forEach(function (f) {
      const stats = statSync(dir + sep + f)
      if (stats.isDirectory()) {
        emptyDir(dir + sep + f)
      } else {
        unlinkSync(dir + sep + f)
        $tools.log.debug('删除文件' + dir + sep + f + '成功')
      }
    })
  }
  emptyDir(state.saveAt + sep + 'videoCache')
}

export function CHANGE_SAVE_AT(state: StoreStates, action: StoreAction<'CHANGE_SAVE_AT'>) {
  // 创建目录
  if (action.data != null) {
    mkdirSync(action.data, { recursive: true })
  }

  return { saveAt: action.data }
}

export function DOWNLOAD_DONE(state: StoreStates, action: StoreAction<'DOWNLOAD_DONE'>) {
  return { downloading: false }
}

export function ACTION_PARSE_CSV(
  state: StoreStates,
  action: StoreAction<'ACTION_PARSE_CSV'>
): {
  tasks: taskInfo[]
} {
  action.data.forEach((d) => {
    d.id = md5(d.url)
    d.key = md5(d.url)
  })
  // 存储tasks
  return { tasks: action.data }
}

const downloadtaskInc = (state: StoreStates, id: string, isError?: boolean) => {
  for (const i in state.tasks) {
    if (Object.prototype.hasOwnProperty.call(state.tasks, i)) {
      if (state.tasks[i].id == id) {
        if (isError) {
          state.tasks[i].errorCount++
        } else {
          state.tasks[i].downloadCount++
        }
      }
    }
  }
}

const getNewArray = (arr: any[], size: number) => {
  // size=5，要分割的长度
  const arrNum = Math.ceil(arr.length / size) // Math.ceil()向上取整的方法，用来计算拆分后数组的长度
  let index = 0 // 定义初始索引
  let resIndex = 0 // 用来保存每次拆分的长度
  const result = []
  while (index < arrNum) {
    result[index] = arr.slice(resIndex, size + resIndex)
    resIndex += size
    index++
  }
  return result
}

const saveFileToOutput = async (
  state: StoreStates,
  id: string | undefined,
  outpath: string,
  outext: string
) => {
  for (const i in state.tasks) {
    if (Object.prototype.hasOwnProperty.call(state.tasks, i)) {
      if (state.tasks[i].id == id) {
        $tools.log.debug('task id ' + state.tasks[i].id + ' file downloading')
        const task = state.tasks[i]
        task.status = taskStatus.downloading
        await $api
          .requestRaw(
            task.url,
            {},
            {
              method: 'GET',
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_1_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
                'Content-Type': 'application/vnd.apple.mpegurl',
              },
              responseType: 'stream',
            }
          )
          .then((v) => {
            console.log('created file :' + outpath + sep + task.name + '.' + outext)
            const fd = createWriteStream(
              outpath + sep + task.name.replace(/[:|\*|\\|/|?|"|<|>|\|]/g, ' ') + '.' + outext
            )
            v.data.pipe(fd)
            state.tasks[i].status = taskStatus.done
          })
      }
    }
  }
}

const mergeTsToMp4 = (
  state: StoreStates,
  id: string | undefined,
  path: string,
  files: any[],
  outpath: string,
  outFileName: string
) => {
  const exec = require('child_process').execFile
  let cfiles: string = ''
  for (const f of files) {
    const fd = path + sep + md5(f.uri) + '.ts'
    cfiles += 'file ' + "'" + fd + "'" + '\r\n'
  }
  // 在对应目录下创建files.txt文件
  const filesTxt = path + sep + 'files.txt'
  writeFileSync(filesTxt, cfiles)
  const params = [
    '-max_error_rate',
    '1',
    '-y',
    '-safe',
    '0',
    '-f',
    'concat',
    '-i',
    filesTxt,
    '-c',
    'copy',
    outpath + sep + outFileName.replace(/[:|\*|\\|/|?|"|<|>|\|]/g, ' ') + '.mp4',
  ]
  let command = ''
  switch (process.platform) {
    case 'darwin':
      command = $tools.ASSETS_PATH + sep + 'ffmpeg' + sep + 'ffmpeg-mac' //+ params
      break
    case 'win32':
      command = $tools.ASSETS_PATH + sep + 'ffmpeg' + sep + 'ffmpeg-win.exe' //+ params
      break
  }

  $tools.log.debug('exec command', command + ' ' + params.join(' '))
  exec(command, params, { killSignal: 'SIGKILL' }, (err: any, stdout: any, stderr: any) => {
    if (err) $tools.log.error('mergeTsToMp4 error', err)
    $tools.log.debug('ffmpeg out', stdout)
    for (const i in state.tasks) {
      if (Object.prototype.hasOwnProperty.call(state.tasks, i)) {
        if (state.tasks[i].id == id) {
          $tools.log.debug('task id ' + state.tasks[i].id + ' done')
          state.tasks[i].status = taskStatus.done
        }
      }
    }
    // $tools.log.debug('ffmpeg err', stderr)
  })
}

export async function ACTION_DOWNLOAD(state: StoreStates, action: StoreAction<'ACTION_DOWNLOAD'>) {
  state.taskInfo.downloading = true
  state.taskInfo.canceled = false
  for (const t of action.data) {
    for (const item of state.tasks) {
      if (item.id == t && item.status != taskStatus.downloading && item.status != taskStatus.mergeing) {
        item.status = taskStatus.queue
      }
    }
  }

  for (const t of action.data) {
    let task: taskInfo | null = null
    //获取单个任务信息
    for (const item of state.tasks) {
      if (item.id == t && item.status != taskStatus.downloading && item.status != taskStatus.mergeing) {
        task = item
        break
      }
    }
    if (task != null) {
      task.status = taskStatus.checking
      //创建cache目录
      const path = state.saveAt + sep + 'videoCache' + sep + task.id
      const err = mkdirSync(path, { recursive: true })

      if (err) $tools.log.error('目录创建失败', err)
      $tools.log.info('创建目录[' + path + ']成功')
      //创建目录成功

      switch (task.type) {
        case taskType.m3u:
          //开始下载ts文件到目标目录
          //切割 playLists
          if (task?.m3uPlayLists) {
            //重置一下下载次数
            if (task.downloadCount != 0) {
              task.downloadCount = 0
            }
            const m3uPlayLists = getNewArray(task?.m3uPlayLists, 15)

            for (const list of m3uPlayLists) {
              task.status = taskStatus.downloading
              const httpReqLists: any[] = []
              for (const u of list) {
                //判断是否取消下载,如果取消,则退出任务
                if (state.taskInfo.canceled) {
                  state.taskInfo.downloading = false
                  state.taskInfo.canceled = false
                  task.status = taskStatus.none
                  return
                }
                //拼接路径
                if (task?.url) {
                  const url = new URL(task?.url)
                  url.pathname = url.pathname.split('/').slice(0, -1).join('/')
                  const tsUrl = url.href + '/' + u.uri
                  // 检查文件
                  const tsfile = path + sep + md5(u.uri) + '.ts'
                  if (existsSync(tsfile)) {
                    if (task.id) {
                      downloadtaskInc(state, task.id)
                      continue
                    }
                  }

                  // 封装request
                  let req = $api
                    .requestRaw(
                      tsUrl,
                      {},
                      {
                        method: 'GET',
                        headers: {
                          'User-Agent':
                            'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_1_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
                          'Content-Type': 'application/vnd.apple.mpegurl',
                        },
                        responseType: 'arraybuffer',
                      }
                    )
                    .then((v) => {
                      const saveFile = (key: any) => {
                        //解密
                        let decipher = crypto.createDecipheriv('aes-128-cbc', key, u.key.iv)
                        // decipher.setAutoPadding(true)
                        let decrypted = decipher.update(Buffer.from(v.data))
                        Buffer.concat([decrypted, decipher.final()])
                        writeFileSync(tsfile, decrypted)
                        //获取单个任务信息
                        downloadtaskInc(state, t)
                        $tools.log.debug('task id ' + t + ' = ' + task?.downloadCount)
                      }

                      //解密ts
                      if (u.key) {
                        switch (u.key.method) {
                          case 'AES-128':
                            // 获取密钥
                            if (state.m3uKeyCache[u.key.uri]) {
                              saveFile(state.m3uKeyCache[u.key.uri])
                            } else {
                              $api
                                .requestRaw(
                                  u.key.uri,
                                  {},
                                  {
                                    method: 'GET',
                                    headers: {
                                      'User-Agent':
                                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_1_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
                                      'Content-Type': 'application/vnd.apple.mpegurl',
                                    },
                                    responseType: 'arraybuffer',
                                  }
                                )
                                .then((res) => {
                                  $tools.log.debug('获取密钥:' + Buffer.from(res.data, 'binary'), u.key.iv)
                                  //缓存密钥信息
                                  let key = []
                                  if (!state.m3uKeyCache[u.key.uri]) {
                                    state.m3uKeyCache[u.key.uri] = res.data
                                    key = res.data
                                  } else {
                                    key = state.m3uKeyCache[u.key.uri]
                                  }
                                  saveFile(key)
                                })
                                .catch((err) => {
                                  downloadtaskInc(state, t, true)
                                  $tools.log.error(
                                    '解密key加载失败,任务ID:' +
                                      action.data +
                                      '地址:' +
                                      u.key.uri +
                                      ' 下载失败' +
                                      err
                                  )
                                })
                            }
                        }
                      }
                    })
                    .catch((e) => {
                      downloadtaskInc(state, t, true)
                      $tools.log.error('请求错误[' + tsUrl + ']:', e)
                    })
                  httpReqLists.push(req)
                }
              }

              if (httpReqLists.length > 0) {
                await Axios.all(httpReqLists).then((d) => {})
              }
            }

            //ts文件合并
            task.status = taskStatus.mergeing
            mergeTsToMp4(state, task.id, path, task.m3uPlayLists, state.saveAt, task.name)
          }
          break
        //文件下载逻辑
        case taskType.mp3:
          // 异步的
          await saveFileToOutput(state, task.id, state.saveAt, 'mp3')
          break
        case taskType.mp4:
          await saveFileToOutput(state, task.id, state.saveAt, 'mp4')
          break
      }
    }
  }
  state.taskInfo.downloading = false
}

type taskInfo = {
  id?: string
  key?: string
  name: string
  url: string
  status: taskStatus
  splitCount?: number
  downloadCount: number
  errorCount: number
  m3uPlayLists?: Array<any> // m3u 下的子ts分片
  m3uDownloadErrorLists?: Array<any> // 下载失败的ts分片
  type: taskType
  errMessage?: string
}

enum taskType {
  mp3 = 1,
  mp4,
  m3u,
}
enum taskStatus {
  none = 1,
  checking,
  downloading,
  done,
  error,
  mergeing,
  queue,
}
declare global {
  interface StoreStates {
    tasks: taskInfo[]
    m3uKeyCache: Map<string, any>
    saveAt: string
    taskInfo: {
      downloading: boolean
      canceled: boolean
    }
  }

  interface StoreActions {
    ACTION_PARSE_CSV: taskInfo[]
    ACTION_DOWNLOAD: string[]
    CHANGE_SAVE_AT: string | null
    CLEAR_CACHE: any
    DOWNLOAD_DONE: any
    CANCEL_DOWNLOAD: any
  }
}
