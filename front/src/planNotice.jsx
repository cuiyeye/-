import { useState } from 'react'
import { Modal } from './ui'

/**
 * 计划变更通知弹窗。
 * 制定或修改计划、确认完成后调用 open()，弹出让用户选通知给谁。
 * 用法：const notice = usePlanNotice(); ... notice.open({...}); 并在页面里渲染 {notice.node}
 */
export function usePlanNotice() {
  const [req, setReq] = useState(null)
  const [picked, setPicked] = useState([])

  function open(payload) {
    setPicked(payload.defaultPeople || [])
    setReq(payload)
  }

  function finish(list) {
    const r = req
    setReq(null)
    if (!r) return
    if (list.length) r.onSend?.(list)
    r.onDone?.()
  }

  const node = req ? (
    <Modal
      title="计划已确认，要通知谁？"
      onCancel={() => finish([])}
      onOk={() => finish(picked)}
      cancelText="不通知"
      okText={`发送给 ${picked.length} 人`}
      okDisabled={picked.length === 0}
    >
      <p className="hint">{req.desc}</p>
      <div className="field">
        <label>勾选要通知的同事（可多选，以异常的形式发给他们）</label>
        <div className="people-picks">
          {(req.employees || []).map((e) => (
            <label key={e.id}>
              <input
                type="checkbox"
                checked={picked.includes(e.id)}
                onChange={() => setPicked((p) => (p.includes(e.id) ? p.filter((x) => x !== e.id) : [...p, e.id]))}
              />
              {e.name}（{e.role}）
            </label>
          ))}
        </div>
      </div>
    </Modal>
  ) : null

  return { open, node }
}
