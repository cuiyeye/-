import { useState } from 'react'
import { useStore } from '../store'
import { Btn, Field, Page, Section, Tabs, useDialog } from '../ui'

const STAGES = ['设计期', '采购期', '生产期', '交付期', '资金期']
const DAY = 86400000

function diffDays(from, to) {
  if (!from || !to) return null
  const a = new Date(`${from}T00:00:00`)
  const b = new Date(`${to}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.round((b - a) / DAY)
}

function evaluate(node, sim) {
  const d = diffDays(sim.today, sim.planDate)
  if (d == null) return { tone: 'gray', title: '未判定', reason: '先把日期填上', next: '—' }

  const isProduction = node.redKind === 'production'
  const due = node.repeat ? '预计发货日' : '到期日'

  if (node.mode === 'after') {
    const days = -d
    const y = Number(node.beforeDays) || 0
    const r = Number(node.redDays) || 0
    if (r > 0 && days >= r) return { tone: 'red', title: '已延期', reason: `起算日已过 ${days} 天，仍未收清`, next: '每天提醒' }
    if (y > 0 && days >= y) return { tone: 'yellow', title: '即将延期', reason: `起算日已过 ${days} 天，仍未收清`, next: '每天提醒' }
    return { tone: 'green', title: '正常', reason: `起算日已过 ${days} 天`, next: '不提醒' }
  }

  if (node.repeat) {
    const sinceStart = -d
    const startAfter = Number(node.startAfterDays) || 0
    const every = Math.max(1, Number(node.everyDays) || 1)
    if (sim.escalated) {
      return { tone: 'red', title: '已延期', reason: `已升级红灯，进入供应商生产第 ${sinceStart} 天仍未发货`, next: '每天提醒' }
    }
    if (sinceStart < startAfter) {
      return { tone: 'green', title: '正常', reason: `进入供应商生产第 ${sinceStart} 天，还没到开始提醒的第 ${startAfter} 天`, next: `第 ${startAfter} 天开始提醒` }
    }
    return { tone: 'yellow', title: '即将延期', reason: `进入供应商生产第 ${sinceStart} 天仍未发货，亮黄灯`, next: `每 ${every} 天提醒一次` }
  }

  let red = ''
  if (d < 0) {
    red = `已过${due} ${-d} 天还没完成`
  } else if (d === 0) {
    if (isProduction) {
      if (!sim.punched) red = '到期当天，过了 12 点还没打卡、也没报备'
      else if (Number(sim.progress) < Number(sim.target)) red = `当天已打卡，但进度 ${sim.progress}%，没达到原计划 ${sim.target}%`
    } else {
      red = `今天就是${due}，还没完成`
    }
  }
  if (red) return { tone: 'red', title: '已延期', reason: red, next: node.repeat ? '每天提醒' : '提醒一次' }

  let yellow = ''
  if (d <= (node.beforeDays ?? 0)) {
    if (node.repeat) {
      yellow = `预计发货前 ${node.beforeDays} 天还没发货`
    } else if (isProduction) {
      const done = d === 0 && sim.punched && Number(sim.progress) >= Number(sim.target)
      if (!done) yellow = d === 0 ? '到期当天还没打卡' : `距${due}还有 ${d} 天，进度还没跟上`
    } else {
      yellow = `距${due}还有 ${d} 天，还没完成`
    }
  }
  if (yellow) {
    return {
      tone: 'yellow',
      title: '即将延期',
      reason: yellow,
      next: node.repeat ? (node.dailyNotice ? '发异常通知，每天一遍' : '发一条异常通知') : '提前提醒一次',
    }
  }
  return {
    tone: 'green',
    title: '正常',
    reason: isProduction && d === 0 ? '到期当天已打卡，进度达标' : `距${due}还有 ${d} 天`,
    next: `提前 ${node.beforeDays} 天开始提醒`,
  }
}

function summary(n) {
  if (n.repeat) return `特殊策略 · 进生产 ${n.startAfterDays} 天后提醒，每 ${n.everyDays} 天一次`
  if (n.mode === 'after') return `交付后 ${n.beforeDays} 天黄 · 超 ${n.redDays} 天红`
  return `提前 ${n.beforeDays} 天黄 · 到期红`
}

export default function RuleCenter() {
  const { state, actions } = useStore()
  const { ask, node } = useDialog()
  const rc = state.ruleCenter || { nodes: [] }
  const nodes = rc.nodes || []
  const [stage, setStage] = useState('设计期')
  const [activeKey, setActiveKey] = useState('design')
  const [draft, setDraft] = useState(null)

  const list = nodes.filter((n) => stage === '全部' || n.stage === stage)
  const active = nodes.find((n) => n.key === activeKey)
  const cur = draft || active

  const [simKey, setSimKey] = useState('design')
  const [simDate, setSimDate] = useState('2026-09-03')
  const [simPlan, setSimPlan] = useState('2026-09-05')
  const [simPunched, setSimPunched] = useState(true)
  const [simProgress, setSimProgress] = useState(50)
  const [simTarget, setSimTarget] = useState(80)
  const [simEsc, setSimEsc] = useState(false)

  const simNode = nodes.find((n) => n.key === simKey) || nodes[0]
  const simResult = simNode
    ? evaluate(simNode, { today: simDate, planDate: simPlan, punched: simPunched, progress: simProgress, target: simTarget, escalated: simEsc })
    : null

  function pick(key) {
    setActiveKey(key)
    const n = nodes.find((x) => x.key === key)
    setDraft(n ? structuredClone(n) : null)
  }

  function set(key, value) {
    if (!cur) return
    const next = structuredClone(cur)
    next[key] = value
    setDraft(next)
  }

  function save() {
    if (!draft) return
    const merged = { ...rc, nodes: nodes.map((n) => (n.key === draft.key ? draft : n)) }
    ask('保存提醒规则', `确认保存「${draft.label}」的规则？`, () => {
      const r = actions.saveRuleCenter(merged)
      if (r.ok) setDraft(null)
      return r
    })
  }

  return (
    <Page crumb={<>基础资料 / 提醒策略</>}>
      {node}
      <div className="card">
        <h3>提醒策略</h3>
        <p className="hint">
          每个节点只配一个数字：到期前提前几天亮黄灯。红灯不用配，到期当天没完成就自动提醒。只有「供应商生产」例外：从进入该状态起算天数、按频率提醒，红灯由人工判断后升级。
        </p>
      </div>

      <Tabs value={stage} onChange={setStage} items={['全部', ...STAGES].map((s) => ({ key: s, label: s, count: s === '全部' ? nodes.length : nodes.filter((n) => n.stage === s).length }))} />

      <div className="rule-layout">
        <div className="rule-list">
          {list.map((n) => (
            <button key={n.key} type="button" className={`rule-item ${n.key === activeKey ? 'active' : ''}`} onClick={() => pick(n.key)}>
              <span className="rule-item-name">
                {n.label}
                {n.repeat && <em className="rule-special">特殊策略</em>}
              </span>
              <span className="rule-item-meta">{summary(n)}</span>
            </button>
          ))}
          {list.length === 0 && <p className="hint">该阶段暂无节点。</p>}
        </div>

        <div className="rule-panel">
          {!cur && <p className="hint">从左侧选一个节点。</p>}
          {cur && (
            <>
              <div className="rule-panel-head">
                <h3>{cur.label}</h3>
                <span className="rule-stage-tag">{cur.stage}</span>
              </div>
              <p className="rule-source">日期来源：{cur.source}</p>

              {cur.repeat ? (
                <>
                  <div className="rule-line">
                    <i className="rule-dot dot-yellow" />
                    <span>进入「供应商生产」后 <input type="number" min="0" value={cur.startAfterDays} onChange={(e) => set('startAfterDays', Number(e.target.value))} /> 天还没发货 → 开始提醒，亮黄灯</span>
                  </div>
                  <div className="rule-line">
                    <i className="rule-dot dot-yellow" />
                    <span>之后每 <input type="number" min="1" value={cur.everyDays} onChange={(e) => set('everyDays', Number(e.target.value))} /> 天提醒一次，直到发货</span>
                  </div>
                  <div className="rule-line rule-readonly">
                    <i className="rule-dot dot-red" />
                    <span>联系后确认赶不及 → 人工在采购订单上点「升级红灯」→ 之后每天提醒（不用配）</span>
                  </div>
                  <p className="hint">这条跟其他节点不一样：不看约定交期，而是从「进入供应商生产」那天起算；红不红由人工判断，系统不自动转红。</p>
                </>
              ) : (
                <>
                  {cur.mode === 'after' ? (
                    <>
                      <div className="rule-line">
                        <i className="rule-dot dot-yellow" />
                        <span>交付后 <input type="number" min="0" value={cur.beforeDays} onChange={(e) => set('beforeDays', Number(e.target.value))} /> 天还没收清 → 亮黄灯，提醒我</span>
                      </div>
                      <div className="rule-line">
                        <i className="rule-dot dot-red" />
                        <span>交付后超过 <input type="number" min="0" value={cur.redDays} onChange={(e) => set('redDays', Number(e.target.value))} /> 天还没收清 → 亮红灯，提醒我</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rule-line">
                        <i className="rule-dot dot-yellow" />
                        <span>到期前 <input type="number" min="0" value={cur.beforeDays} onChange={(e) => set('beforeDays', Number(e.target.value))} /> 天还没完成 → 亮黄灯，提醒我</span>
                      </div>
                      <div className="rule-line rule-readonly">
                        <i className="rule-dot dot-red" />
                        <span>
                          {cur.redKind === 'production'
                            ? '到期当天，过了 12 点还没打卡、也没报备，或者当天打了卡但进度没达到原计划 → 亮红灯，提醒我（不用配）'
                            : '到期当天还没完成 → 亮红灯，提醒我（不用配）'}
                        </span>
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="rule-box">
                <div className="rule-box-title">提醒人</div>
                <div className="people-picks">
                  {state.employees.filter((emp) => emp.status !== 'off').map((emp) => (
                    <label key={emp.id}>
                      <input
                        type="checkbox"
                        checked={(cur.people || []).includes(emp.id)}
                        onChange={() => {
                          const p = cur.people || []
                          set('people', p.includes(emp.id) ? p.filter((x) => x !== emp.id) : [...p, emp.id])
                        }}
                      />
                      {emp.name}（{emp.role}）
                    </label>
                  ))}
                </div>
                <p className="hint">这个环节亮灯或报异常时，通知就发给这些人。</p>
              </div>

              <div className="row-actions">
                <Btn kind="primary" onClick={save}>保存</Btn>
                <Btn kind="ghost" onClick={() => setDraft(null)}>放弃修改</Btn>
              </div>
            </>
          )}
        </div>
      </div>

      <Section title="试算一下" hint="填个日期看看会亮什么灯。">
        <div className="filters">
          <Field label="节点">
            <select value={simKey} onChange={(e) => setSimKey(e.target.value)}>
              {nodes.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
            </select>
          </Field>
          <Field label="今天"><input type="date" value={simDate} onChange={(e) => setSimDate(e.target.value)} /></Field>
          <Field label={simNode?.repeat ? '进入供应商生产日' : '到期日'}>
            <input type="date" value={simPlan} onChange={(e) => setSimPlan(e.target.value)} />
          </Field>
          {simNode?.repeat && (
            <Field label="是否已升级红灯">
              <select value={simEsc ? '1' : '0'} onChange={(e) => setSimEsc(e.target.value === '1')}>
                <option value="0">否，还在黄灯</option>
                <option value="1">是，已人工升级</option>
              </select>
            </Field>
          )}
          {simNode?.redKind === 'production' && (
            <>
              <Field label="到期当天是否已打卡">
                <select value={simPunched ? '1' : '0'} onChange={(e) => setSimPunched(e.target.value === '1')}>
                  <option value="1">已打卡</option>
                  <option value="0">还没打卡</option>
                </select>
              </Field>
              <Field label="打卡进度 %"><input type="number" value={simProgress} onChange={(e) => setSimProgress(Number(e.target.value))} /></Field>
              <Field label="原计划进度 %"><input type="number" value={simTarget} onChange={(e) => setSimTarget(Number(e.target.value))} /></Field>
            </>
          )}
        </div>
        {simResult && (
          <div className={`rule-sim tone-${simResult.tone}`}>
            <div className="rule-sim-tone">
              <i className={`rule-dot dot-${simResult.tone}`} />
              {simResult.title}
            </div>
            <div className="rule-sim-reason">{simResult.reason}</div>
            <div className="rule-sim-next">下次提醒：<b>{simResult.next}</b></div>
          </div>
        )}
      </Section>
    </Page>
  )
}
