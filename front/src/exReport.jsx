import { useState } from 'react'
import { EX_CATEGORY, reminderOf, useStore } from './store'
import { Modal } from './ui'

/** 环节 → 提醒策略节点 key，用来取该环节配置好的默认提醒人 */
const PROCESS_REMIND_KEY = {
  设计: 'design',
  BOM: 'bom',
  采购: 'purchaseOrder',
  生产: 'productionStep',
  出库: 'outbound',
  安装调试: 'install',
  培训: 'train',
  回款: 'receipt',
  库存: '',
}

/**
 * 通用「提交异常」弹窗。
 * 全系统统一：环节 + 类别 + 说明 + 通知对象（默认 = 提醒策略里该环节配的提醒人，可改）。
 * 用法：
 *   const ex = useExReport()
 *   <Btn onClick={() => ex.open({ process: '安装调试', soId, onDone: flash })}>提交异常</Btn>
 *   {ex.node}
 */
export function useExReport() {
  const { state, actions } = useStore()
  const [req, setReq] = useState(null)
  const [category, setCategory] = useState('其他')
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState([])

  function open(o) {
    const key = o.remindKey || PROCESS_REMIND_KEY[o.process] || ''
    const def = key ? reminderOf(state, key).people : []
    setReq(o)
    setCategory(o.category || '其他')
    setNote('')
    setPicked(def.length ? def : ['E01'])
  }

  function toggle(id) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  function submit() {
    const text = note.trim()
    const r = actions.reportEx({
      process: req.process,
      category,
      soId: req.soId || '',
      poId: req.poId || '',
      productId: req.productId || '',
      title: text || req.title || `${req.process}异常`,
      content: text,
      level: req.level || 'yellow',
      people: picked,
      createdBy: req.createdBy || '维',
    })
    const done = req.onDone
    setReq(null)
    done?.(r)
  }

  const node = req ? (
    <Modal title={`提交异常 · ${req.process}`} onCancel={() => setReq(null)} onOk={submit} okDisabled={!note.trim() && !req.title} okText="提交" wide>
      <p className="hint">{req.hint || '提交后进入异常中心，并按下面勾选的人发通知。'}</p>
      <div className="field">
        <label>异常类别</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {EX_CATEGORY.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="req">异常说明</label>
        <input autoFocus value={note} placeholder={req.placeholder || '说清楚发生了什么，方便别人接手'} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="field">
        <label>通知对象（默认按提醒策略里本环节的提醒人，可增减）</label>
        <div className="people-picks">
          {state.employees.filter((emp) => emp.status !== 'off').map((emp) => (
            <label key={emp.id}>
              <input type="checkbox" checked={picked.includes(emp.id)} onChange={() => toggle(emp.id)} />
              {emp.name}（{emp.role}）
            </label>
          ))}
        </div>
      </div>
    </Modal>
  ) : null

  return { open, node }
}
