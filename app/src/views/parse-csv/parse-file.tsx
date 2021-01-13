import React, { useRef, useState } from 'react'
import { Empty, Button, Spin, message } from 'antd'
import { withStore } from '@/src/components'
import { Parser } from 'm3u8-parser'
import { RouterProps } from 'react-router'

type taskInfo = {
  name: string
  url: string
  status: number
  splitCount: number
  downloadCount: number
  m3uPlayLists?: Array<string> // m3u 下的子ts分片
}

const parseM38 = async (props: StoreProps & RouterProps, raw: string | ArrayBuffer) => {
  const rows: Array<string> = raw.toString().split(/\r?\n|\r/)
  console.debug('on csv result', rows)
  const res: Array<taskInfo> = []
  for (const v of rows) {
    const row = v.split(',')
    if (row.length > 1) {
      console.debug('on  push csv item', row)
      const item: taskInfo = { name: row[0], url: row[1], status: 1, downloadCount: 0, splitCount: 0 }
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
          console.log(m3u[0])
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
          }
        })
        .catch((e) => {
          console.error('request error:', e)
        })
    }
  }
  props.dispatch({ type: 'ACTION_PARSE_CSV', data: res })
  props.history.push('/download-task')
}

export default withStore(['tasks'])(function (props: StoreProps & RouterProps & StoreStates) {
  console.log(props)
  if (props.tasks.length > 0) {
    props.history.push('/download-task')
  }
  const [spinning, setSpinning] = useState(false)
  const iRef = useRef<HTMLInputElement | null>(null)
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
            // 将图片转成DataURL格式
            reader.readAsText(file)
            reader.onload = function () {
              //读取完毕后输出结果
              // dispatch({ type: 'setCsvRaw', payload: reader.result })

              // props.dispatch({ type: 'ACTION_PARSE_CSV', data: reader.result })
              // 加载完成,渲染表格组件
              console.log(props)
              if (reader.result) {
                parseM38(props, reader.result)
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
      <Spin tip="文件解析中" spinning={spinning}>
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
})
