import React, { useEffect, useRef, useState } from 'react'
import { withStore } from '@/src/components'
import { RouteProps } from 'react-router-dom'
import { Table, Button, Input, Alert, message } from 'antd'
import { sep } from 'path'
const { dialog, getGlobal } = require('electron').remote

export default withStore(['tasks', 'saveAt', 'taskInfo'])((props: RouteProps & StoreProps & StoreStates) => {
  console.log('props.downloading', props.taskInfo.downloading)
  const [tdata, settdata] = useState<any[]>([])
  const [hasSelected, setHasSelected] = useState<boolean>(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<any[]>([])
  const initfunc = () => {
    const res: any[] = []
    console.info(props.tasks)
    props.tasks.forEach((e: any) => {
      e.key = e.id
      res.push(e)
    })
    settdata(res)
  }
  useEffect(() => {
    const { remote } = require('electron')
    remote.getCurrentWindow().setSize(800, 600)
    initfunc()
    const timer = setInterval(initfunc, 3000)
    //初始化保存目录
    props.dispatch({
      type: 'CHANGE_SAVE_AT',
      data:
        localStorage.getItem('saveAt') != null
          ? localStorage.getItem('saveAt')
          : $tools.USER_DATA_PATH + sep + 'output',
    })

    return () => clearInterval(timer)
  }, [])

  const columns = [
    {
      title: '课程名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '总大小',
      dataIndex: 'splitCount',
      key: 'splitCount',
    },
    {
      title: '已下载分片',
      dataIndex: 'downloadCount',
      key: 'downloadCount',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: number) => {
        switch (v) {
          case 1:
            return <p>未开始</p>
          case 2:
            return <p>检查数据</p>
          case 3:
            return <p>开始下载</p>
          case 4:
            return <p>已下载完成</p>
          case 5:
            return <p>下载失败请重试</p>
          case 6:
            return <p>合并视频中</p>
          case 7:
            return <p>队列中</p>
        }
      },
    },
  ]
  const onSelectChange = (selectedRowKeys: any) => {
    console.log('selectedRowKeys changed: ', selectedRowKeys)
    if (selectedRowKeys.length > 0) {
      setHasSelected(true)
    } else {
      setHasSelected(false)
    }

    setSelectedRowKeys(selectedRowKeys)
  }
  const rowSelection = {
    onChange: onSelectChange,
    selections: [Table.SELECTION_ALL, Table.SELECTION_INVERT],
  }

  const start = async () => {
    initfunc()
    props.dispatch({ type: 'ACTION_DOWNLOAD_M3U', data: selectedRowKeys })

    console.log('task done')
  }

  const selectDir = () => {
    const options = {
      title: '打开文件',
      defaultPath: '',
      buttonLabel: '打开',
      properties: ['openDirectory'],
    }
    const files = dialog.showOpenDialogSync(options)
    if (files.length > 0) {
      localStorage.setItem('saveAt', files[0])
      props.dispatch({ type: 'CHANGE_SAVE_AT', data: files[0] })
    }
  }

  const clearCache = () => {
    const options = {
      type: 'info',
      buttons: ['取消', '确认'],
      message: '清除缓存将会清除工具缓存在本地的视频缓存文件,确认清除缓存?',
      icon: null,
      cancelId: 1,
    }
    const bidx = dialog.showMessageBoxSync(options)
    if (bidx == 1) {
      // 执行清除缓存操作
      props.dispatch({ type: 'CLEAR_CACHE', data: null })
    }
  }

  return (
    <div>
      <Alert message="如果下载的视频,出现黑屏,卡顿,缺失,重新下载即可" type="info" />
      {props.taskInfo.downloading && (
        <Alert style={{ marginTop: '5px' }} message={<div>下载任务进行中,请勿重复添加任务</div>} type="info" />
      )}
      <div style={{ marginBottom: 16 }}></div>
      <div style={{ marginBottom: 16 }}>
        <p>选择文件存储目录</p>
        <Input type="primary" addonAfter={<a onClick={selectDir}>选择目录</a>} value={props.saveAt} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <Button type="dashed" danger style={{ margin: '0 15px 0 0' }} onClick={clearCache}>
          清除缓存
        </Button>

        <Button type="primary" onClick={start} disabled={!hasSelected || props.taskInfo.downloading}>
          下载选中文件
        </Button>
        <span style={{ marginLeft: 8 }}>
          {hasSelected ? (
            selectedRowKeys.length > 5 ? (
              <Alert
                style={{ marginTop: '5px' }}
                message="选择超过5个文件同时下载可能存在文件损坏,最好不要同时下载超过5个文件"
                type="warning"
              />
            ) : (
              `已选择 ${selectedRowKeys.length}/${tdata.length} 个文件`
            )
          ) : (
            ''
          )}
        </span>
      </div>
      <Table rowSelection={rowSelection} dataSource={tdata} columns={columns} />
    </div>
  )
})
