import { useState, Children } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export function Tag({ children, color = 'gray' }) {
  return <span className={`tag tag-${color}`}>{children}</span>
}

/**
 * 单据状态标签 —— 全站唯一口径，各页不要再自己拼 className。
 * 分三层，只有「要你动手」的才上色：
 *   warn 橙 = 现在就该有人去处理：待入库 / 待发货 / 待出库 / 待安装 / 待培训 / 待付款 / 待收款
 *   run  蓝 = 正在推进、等着就行：已确认 / 待交付 / 在途 / 进行中 / 生产中 / 已下单 / 部分入库
 *   calm 灰 = 草稿，以及一切已经结束的状态：已完成 / 已交付 / 已入库 / 已签收 / 已结清 / 已取消
 * —— 完成类和取消类一律不上色，绿黄红只留给「延期」提示。
 */
const DOC_TONE = {
  // 要你动手
  待入库: 'warn', 待发货: 'warn', 待出库: 'warn', 待安装: 'warn', 待培训: 'warn',
  待付款: 'warn', 待收款: 'warn',
  // 正在推进
  设计中: 'run', 采购中: 'run', 生产中: 'run', 交付中: 'run',
  在途: 'run', 进行中: 'run', 已下单: 'run', 部分入库: 'run', 部分付款: 'run', 部分收款: 'run',
  // 草稿 / 已结束 → 不上色
  未建: 'calm', 草稿: 'calm', 已完成: 'calm', 已完结: 'calm', 已交付: 'calm',
  已入库: 'calm', 已出库: 'calm', 已签收: 'calm', 已付清: 'calm', 已收清: 'calm',
  已结清: 'calm', 已取消: 'calm', 无应付: 'calm', 无应收: 'calm', 未入库: 'calm', 已回退: 'calm',
}

export function docTone(label) {
  return DOC_TONE[String(label || '').trim()] || 'calm'
}

export function DocStatus({ value, tone }) {
  if (!value) return null
  return <span className={`tag doc-${tone || docTone(value)}`}>{value}</span>
}

export function statusTag(confirm, close) {
  if (close === 'closed') return <DocStatus value="已取消" />
  if (confirm === 'draft') return <DocStatus value="草稿" />
  if (confirm === 'confirmed') return <DocStatus value="已确认" />
  return <DocStatus value={confirm} />
}

export function inboundTag(v) {
  const map = { none: ['未入库', 'gray'], partial: ['部分入库', 'orange'], all: ['全部入库', 'green'] }
  const [t, c] = map[v] || [v, 'gray']
  return <Tag color={c}>{t}</Tag>
}

export function settleTag(v) {
  const map = { none: ['无应付', 'gray'], unpaid: ['未结算', 'gray'], partial: ['部分结算', 'orange'], all: ['全部结算', 'green'] }
  const [t, c] = map[v] || [v, 'gray']
  return <Tag color={c}>{t}</Tag>
}

export function delayTag(tone) {
  if (tone === 'overdue') return <Tag color="red">延期</Tag>
  if (tone === 'maybe') return <Tag color="orange">即将延期</Tag>
  return '—'
}

/** 绿 / 黄 / 红 进度灯，对照 delayTone */
export function ProgressLamp({ tone }) {
  const kind = tone === 'overdue' ? 'red' : tone === 'maybe' ? 'yellow' : 'green'
  const glass = kind === 'red' ? '#f53f3f' : kind === 'yellow' ? '#faad14' : '#00b42a'
  const rim = kind === 'red' ? '#a61b1b' : kind === 'yellow' ? '#ad6800' : '#008026'
  const shine = kind === 'red' ? '#ffc4bf' : kind === 'yellow' ? '#fff7e8' : '#c8f4d4'
  const label = kind === 'red' ? '已延期' : kind === 'yellow' ? '即将延期' : '正常'
  return (
    <svg className="ex-lamp" viewBox="0 0 16 20" aria-label={label} title={label}>
      <path d="M8 1c3.2 0 5.8 2.7 5.8 6.1 0 2.3-1.4 4.2-3.3 5.2v.9H5.5v-.9C3.6 11.3 2.2 9.4 2.2 7.1 2.2 3.7 4.8 1 8 1z" fill={rim} />
      <path d="M8 2.1c2.7 0 4.9 2.2 4.9 5 0 2-1.2 3.6-2.9 4.4l-.3.2v.5H6.3v-.5l-.3-.2C4.3 10.7 3.1 9.1 3.1 7.1c0-2.8 2.2-5 4.9-5z" fill={glass} />
      <ellipse cx="6.2" cy="5.2" rx="1.5" ry="2" fill={shine} opacity="0.7" />
      <path d="M6.6 8.2v1.6M9.4 8.2v1.6M6.6 9.8h2.8" stroke={rim} strokeWidth="0.7" fill="none" />
      <rect x="5.4" y="13.1" width="5.2" height="1.1" rx="0.3" fill="#8c8c8c" />
      <rect x="5.8" y="14.2" width="4.4" height="3.6" rx="0.5" fill="#d9d9d9" />
      <path d="M6.1 15.2h3.8M6.1 16.3h3.8M6.1 17.4h3.8" stroke="#8c8c8c" strokeWidth="0.55" />
      <rect x="6.8" y="17.8" width="2.4" height="1.3" rx="0.5" fill="#8c8c8c" />
    </svg>
  )
}

export function ProgressCell({ stage, tone, hideLamp }) {
  return (
    <span className="row-actions" style={{ gap: 6 }}>
      <span>{stage}</span>
      {hideLamp ? null : <ProgressLamp tone={tone || ''} />}
    </span>
  )
}

export function matchDelay(tone, delay) {
  if (!delay) return true
  if (delay === 'ok') return !tone
  return tone === delay
}

export function Btn({ children, kind, ...rest }) {
  const cls = kind === 'primary' ? 'btn btn-primary' : kind === 'danger' ? 'btn btn-danger' : kind === 'ghost' ? 'btn btn-ghost' : 'btn'
  return (
    <button className={cls} type="button" {...rest}>
      {children}
    </button>
  )
}

export function Modal({ title, children, onOk, onCancel, okText = '确认', cancelText = '取消', okDisabled, wide }) {
  return (
    <div className="modal-mask" onClick={onCancel}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <h4>{title}</h4>
        <div>{children}</div>
        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
          <Btn onClick={onCancel}>{cancelText}</Btn>
          <Btn kind="primary" onClick={onOk} disabled={okDisabled}>
            {okText}
          </Btn>
        </div>
      </div>
    </div>
  )
}

export function useDialog() {
  const [dlg, setDlg] = useState(null)
  const [draft, setDraft] = useState('')
  const [toast, setToast] = useState(null)
  function ask(title, message, run, input) {
    setDraft(input?.default || '')
    setDlg({ title, message, run, input })
  }
  function flash(res) {
    setToast(res)
    setTimeout(() => setToast(null), 2400)
  }
  async function ok() {
    const res = dlg.input ? dlg.run(draft) : dlg.run()
    setDlg(null)
    flash(res)
  }
  const node = (
    <>
      {dlg && (
        <Modal title={dlg.title} onCancel={() => setDlg(null)} onOk={ok}>
          <p>{dlg.message}</p>
          {dlg.input && (
            <div className="field" style={{ marginTop: 8 }}>
              <label>{dlg.input.label || '请输入'}</label>
              <input
                autoFocus
                type={dlg.input.type || 'text'}
                value={draft}
                placeholder={dlg.input.placeholder || ''}
                onChange={(e) => setDraft(e.target.value)}
              />
            </div>
          )}
        </Modal>
      )}
      {toast && <div role="status" className={toast.ok === false ? 'toast toast-bad' : 'toast'}>{toast.message || toast}</div>}
    </>
  )
  return { ask, flash, node }
}

export function Field({ label, required, children }) {
  return (
    <div className="field">
      <label className={required ? 'req' : ''}>{label}</label>
      {children}
    </div>
  )
}

export function Table({ columns, rows, onRow }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} style={{ color: '#86909c' }}>
                暂无数据
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={r.id || `row-${i}`} onDoubleClick={() => onRow?.(r)}>
              {columns.map((c) => (
                <td key={c.key} className={[c.link ? 'link' : '', c.wrap ? 'wrap' : ''].filter(Boolean).join(' ')} onClick={c.link ? () => onRow?.(r) : undefined}>
                  {c.render ? c.render(r, i) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Tabs({ value, onChange, items }) {
  return (
    <div className="tabs">
      {items.map((it) => (
        <button key={it.key} className={`tab ${value === it.key ? 'active' : ''}`} onClick={() => onChange(it.key)}>
          {it.label}
          {it.count != null && <em>{it.count}</em>}
        </button>
      ))}
    </div>
  )
}

export function OpsLinks({ items = [], max = 3 }) {
  const [open, setOpen] = useState(false)
  const list = items.filter(Boolean)
  const overflow = list.length > max
  const shown = overflow ? list.slice(0, max - 1) : list
  const rest = overflow ? list.slice(max - 1) : []

  return (
    <span className="ops-links" onClick={(e) => e.stopPropagation()}>
      {shown.map((it) => (
        <button key={it.label} type="button" className="ops-link" onClick={it.onClick} disabled={it.disabled}>
          {it.label}
        </button>
      ))}
      {rest.length > 0 && (
        <span className="ops-more">
          <button type="button" className="ops-link" onClick={() => setOpen((v) => !v)}>
            更多
            <i className="ops-more-chev" />
          </button>
          {open && (
            <>
              <div className="quick-mask" onClick={() => setOpen(false)} />
              <div className="ops-more-menu">
                {rest.map((it) => (
                  <button
                    key={it.label}
                    type="button"
                    className="ops-link"
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(false)
                      it.onClick?.()
                    }}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </span>
      )}
    </span>
  )
}

export function Page({ crumb, title, extra, children }) {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  // 「异常中心 → 去处理」过来时带 back 参数，任意页面都能一键回到那条异常的处理详情
  const back = sp.get('back')
  return (
    <>
      {crumb ? (
        <div className="crumb">
          <span className="crumb-path">{crumb}</span>
          {back ? (
            <button className="btn-mini" style={{ marginLeft: 10 }} onClick={() => nav(back)}>← 返回异常处理</button>
          ) : null}
        </div>
      ) : null}
      {(title || extra) && (
        <div className="page-head">
          {title ? <h2>{title}</h2> : <span />}
          {extra ? <div className="row-actions page-actions">{extra}</div> : null}
        </div>
      )}
      {children}
    </>
  )
}

export function FormCard({ title, extra, children }) {
  return (
    <div className="card form-card">
      {title && <h2 className="form-title">{title}</h2>}
      {extra && <div className="row-actions form-actions">{extra}</div>}
      {children}
    </div>
  )
}

export function Section({ title, hint, children }) {
  return (
    <div className="section">
      <h3>{title}</h3>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </div>
  )
}

export function Pager({ total, page, onChange, pageSize = 10 }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="pager">
      <span>共 {total} 条</span>
      <Btn disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </Btn>
      <span>
        {page} / {pages}
      </span>
      <Btn disabled={page >= pages} onClick={() => onChange(page + 1)}>
        下一页
      </Btn>
    </div>
  )
}

export function slicePage(rows, page, pageSize = 10) {
  const start = (page - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

export function FilterActions({ onQuery, onReset }) {
  return (
    <div className="filter-actions">
      <Btn onClick={onReset}>重置</Btn>
      <Btn kind="primary" onClick={onQuery}>
        查询
      </Btn>
    </div>
  )
}

/** 列表筛选项：超过一栏（默认 3 列）时默认只展示第一行，可展开 */
export function Filters({ children, onQuery, onReset, cols = 3 }) {
  const [expanded, setExpanded] = useState(false)
  const fields = Children.toArray(children).filter(Boolean)
  const needExpand = fields.length > cols
  const shown = !needExpand || expanded ? fields : fields.slice(0, cols)
  return (
    <div className="filters">
      {shown}
      <div className="filter-actions">
        {needExpand && (
          <button type="button" className="filter-expand" onClick={() => setExpanded((v) => !v)}>
            {expanded ? '收起' : '展开'}
            <i className={`filter-expand-chev ${expanded ? 'up' : ''}`} />
          </button>
        )}
        <Btn onClick={onReset}>重置</Btn>
        <Btn kind="primary" onClick={onQuery}>
          查询
        </Btn>
      </div>
    </div>
  )
}
