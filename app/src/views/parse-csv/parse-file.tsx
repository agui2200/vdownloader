import React, { useRef, useState } from 'react'
import { Empty, Button, Spin, message } from 'antd'
import { withStore } from '@/src/components'
import { Parser } from 'm3u8-parser'
import { RouterProps } from 'react-router'
import { useDispatch, useSelector } from 'react-redux'
import { request } from '@/core/api'

type taskInfo = {
  name: string
  url: string
  status: number
  splitCount: number
  downloadCount: number
  errorCount: number
  m3uPlayLists?: Array<string> // m3u 下的子ts分片
  type?: number
  errMessage?: string
}

const parseFile = async (
  raw: string | ArrayBuffer,
  cb: (count: number, item: taskInfo) => void,
  ecb?: (item: taskInfo, err: any) => void
) => {
  const rows: Array<string> = raw.toString().split(/\r?\n|\r/)
  const res: Array<taskInfo> = []
  for (const v of rows) {
    const row = v.split(',')
    if (row.length > 1) {
      const item: taskInfo = {
        name: row[0],
        url: row[1],
        status: 1,
        downloadCount: 0,
        splitCount: 0,
        errorCount: 0,
      }
      console.log('on  push csv item', row)
      if (row[1].indexOf('.mp3') > 0) {
        // 直接是mp3的,算音频
        item.type = 1
        res.push(item)
        cb(rows.length, item)
        continue
      }
      if (row[1].indexOf('.m4a') > 0) {
        // 直接是mp3的,算音频
        item.type = 5
        res.push(item)
        cb(rows.length, item)
        continue
      }
      if (row[1].indexOf('.mp4') > 0) {
        // 直接是mp4视频
        item.type = 2
        res.push(item)
        cb(rows.length, item)
        continue
      }
      if (row[1].indexOf('.m3u') > 0) {
        let drmHeaders = {}
        // 检查一下特殊url,针对xiaoetong做的header 处理
        if (item.url && item.url.indexOf('encrypt-k-vod.xet.tech') > 0) {
          const url = new URL(item.url)
          const refs = url.searchParams.get('whref')
          if (refs) {
            drmHeaders = {
              Referer: 'http://' + refs.split(',')[0],
              Origin: 'http://' + refs.split(',')[0],
            }
            $api.setHeaders(drmHeaders)
          }
        }
        console.log(item.url)
        item.type = 3
        const m3uUrl = item.url.split('/') //处理掉最后的file.m3u,改为ts
        const tsPath = m3uUrl.slice(0, -1).join('/') //url 还原
        await $api
          .requestRaw(
            item.url,
            {},
            {
              method: 'GET',
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_1_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
                'Content-Type': 'application/vnd.apple.mpegurl',
              },
            }
          )
          .then((e) => {
            console.log(tsPath)
            const resp = e.data
            // 解析m3u
            const m3u: Array<string> = resp.split(/\r?\n|\r/)
            console.log(m3u[0], e)
            if (m3u[0].indexOf('#EXTM3U') != -1) {
              // 这样才是m3u
              const parser = new Parser()
              parser.push(resp)
              parser.end()
              console.log(parser.manifest)
              item.m3uPlayLists = parser.manifest.segments
              item.splitCount = item.m3uPlayLists?.length ? item.m3uPlayLists?.length : 0
              // 解析出来开始下载
              res.push(item)
              cb(rows.length, item)
            }
          })
          .catch((e) => {
            if (ecb) {
              item.status = 5
              item.errMessage = e
              res.push(item)
              ecb(item, e)
            }
          })
        continue
      }
      // 全部都没有的
      item.type = 4
      res.push(item)
      cb(rows.length, item)
    }
  }
  return res
}

export default function (props: RouterProps) {
  const tasks = useSelector((state: StoreStates) => state.tasks)
  if (tasks.length > 0) {
    props.history.push('/download-task')
  }
  const dispatch = useDispatch()
  const [spinning, setSpinning] = useState(false)
  const [parseCount, setParseCount] = useState(0)
  const [parseRowsCount, setParseRowsCount] = useState(0)
  const iRef = useRef<HTMLInputElement | null>(null)
  let cc = 0
  const parsef = (e: any) => {
    return (ee: any) => {
      console.log(e, ee)
      e.current.click()
      //文件读取
    }
  }
  return (
    <React.Fragment>
      <input
        type="file"
        ref={iRef}
        hidden
        onChange={(f) => {
          setSpinning(true)
          const files = f.target?.files
          if (files != null && files?.length > 0) {
            const file = files[0]
            const reader = new FileReader()
            reader.readAsText(file)
            reader.onload = async function () {
              //读取完毕后输出结果
              // dispatch({ type: 'setCsvRaw', payload: reader.result })

              // props.dispatch({ type: 'ACTION_PARSE_CSV', data: reader.result })
              // 加载完成,渲染表格组件
              if (reader.result) {
                const res = await parseFile(
                  reader.result,
                  (count) => {
                    setParseRowsCount(count)
                    cc = cc + 1
                    setParseCount(cc)
                    console.log(parseCount)
                  },
                  () => {}
                )
                dispatch({ type: 'ACTION_PARSE_CSV', data: res })
                props.history.push('/download-task')
              } else {
                setSpinning(false)
              }

              // props.history.push('download-task')
            }
          } else {
            setSpinning(false)
            $tools.log.info('load csv file error,file is not found!')
            message.error('文件读取失败,请重试!')
          }
        }}
      />
      <Spin tip={` 文件解析中[${parseCount}/${parseRowsCount}]`} spinning={spinning}>
        <Empty
          style={{ height: '50%', padding: '40% 0' }}
          image={Empty.PRESENTED_IMAGE_DEFAULT}
          imageStyle={
            {
              // height: 60,
            }
          }
          description={
            <span>
              请选择从课程解析站点下载的《<b>url.csv</b>》 文件
            </span>
          }
        >
          <Button type="primary" onClick={parsef(iRef)}>
            选择文件
          </Button>
        </Empty>
      </Spin>
    </React.Fragment>
  )
}
