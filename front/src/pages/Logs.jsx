import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { nameOf, useStore } from '../store'
import { Btn, Field, Filters, Page, Pager, Table, Tabs, slicePage } from '../ui'

export default function Logs() {
  const { state } = useStore()
  const nav = useNavigate()
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [soId, setSoId] = useState('')
  const [module, setModule] = useState('')
  const [by, setBy] = useState('')
  const [page, setPage] = useState(1)
  const hist = state.logs.map((r) => ({
    ...r,
    projectName: r.soId ? nameOf(state.salesOrders, r.soId, 'projectName') : '',
  }))
  const all = hist
  const modules = [...new Set(hist.map((r) => r.module).filter(Boolean))]
  const people = [...new Set(hist.map((r) => r.by).filter(Boolean))]
  const rows = all.filter((r) => {
    if (tab === 'human' && r.type !== '人工操作') return false
    // 「系统触发」= 系统自己干的（自动生成采购建议、自动落库提醒等），提醒留档也归这一档
    if (tab === 'auto' && r.type !== '系统触发' && r.type !== '系统提醒') return false
    if (q && !String(r.title || '').includes(q) && !String(r.billId || '').includes(q)) return false
    if (soId && r.soId !== soId) return false
    if (module && r.module !== module) return false
    if (by && r.by !== by) return false
    return true
  })

  return (
    <Page crumb={<>操作记录</>}>
      <div className="card">
        <Tabs
          value={tab}
          onChange={(k) => { setTab(k); setPage(1) }}
          items={[
            { key: 'all', label: '全部留档', count: hist.length },
            { key: 'human', label: '人工操作', count: hist.filter((r) => r.type === '人工操作').length },
            { key: 'auto', label: '系统触发', count: hist.filter((r) => r.type === '系统触发' || r.type === '系统提醒').length },
          ]}
        />
        <Filters onQuery={() => setPage(1)} onReset={() => { setQ(''); setSoId(''); setModule(''); setBy(''); setPage(1) }}>
          <Field label="内容">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="事件 / 单号" />
          </Field>
          <Field label="项目">
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">全部项目</option>
              {state.salesOrders.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
          <Field label="模块">
            <select value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="">全部</option>
              {modules.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="操作人">
            <select value={by} onChange={(e) => setBy(e.target.value)}>
              <option value="">全部</option>
              {people.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          
        </Filters>
        <Table
          onRow={(r) => r.soId && nav(`/sales/${r.soId}`)}
          columns={[
            { key: 'at', title: '时间' },
            { key: 'type', title: '类型', render: (r) => r.type },
            { key: 'by', title: '操作人' },
            { key: 'module', title: '模块', render: (r) => r.module || '—' },
            { key: 'projectName', title: '项目', link: true, render: (r) => r.projectName || (r.soId ? r.soId : '—') },
            { key: 'title', title: '事件', wrap: true },
          ]}
          rows={slicePage(rows, page)}
        />
        <Pager total={rows.length} page={page} onChange={setPage} />
      </div>
    </Page>
  )
}
