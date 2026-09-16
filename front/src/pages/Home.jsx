import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { exOpen, exProcess, lightLogsOf, nameOf, poDue, poOpenInbound, punchRisk, receivedOf, reminderOf, useStore } from '../store'
import { Btn, Tag, useDialog } from '../ui'

export default function Home() {
  const { state } = useStore()
  const nav = useNavigate()
  const { node } = useDialog()
  const [quick, setQuick] = useState(false)
  // 提醒都已落成异常（含系统实时生成的 auto 异常）：首页只认异常，点进去就是这条异常的详情页
  const openEx = state.exceptions.filter(exOpen)
  const topCount = openEx.length
  const running = state.salesOrders.filter((s) => s.confirmStatus === 'confirmed' && s.closeStatus === 'open')
  const inProgress = running.filter((so) => !state.outboundOrders.find((o) => o.soId === so.id)?.trained)
  const falls = inProgress.filter((so) => so.fallConfirmed)
  const exPoIds = new Set(openEx.filter((e) => e.poId).map((e) => e.poId))
  // 未完成 ≠ 异常：已经有未完结异常的项目/单据，底部不再重复当待办
  const exSoIds = new Set(openEx.filter((e) => e.soId).map((e) => e.soId))
  // 「未入完」= 非补件 + 未取消 + 没全部入库（含部分入库），与采购列表同源
  const todoPo = poOpenInbound(state).filter((p) => !exPoIds.has(p.id))
  const todoPart = state.purchaseOrders.filter((p) => p.part && p.inboundStatus !== 'all' && !exPoIds.has(p.id))
  const todoPp = state.productionPlans.filter((p) => !p.done && !exSoIds.has(p.soId))
  const todoFgOut = [
    ...state.outboundOrders.filter((o) => o.status === 'pending').map((o) => ({ soId: o.soId })),
    ...state.productionPlans.filter((p) => p.done && !state.outboundOrders.find((o) => o.soId === p.soId)).map((p) => ({ soId: p.soId })),
  ].filter((x) => !exSoIds.has(x.soId))
  const todoDeliver = state.outboundOrders.filter((o) => o.status === 'done' && !o.trained && !exSoIds.has(o.soId))
  const todoRtn = state.returns.filter((r) => !state.returnOuts.find((o) => o.rtnId === r.id)?.signed && !exPoIds.has(r.poId))
  // 应付拆两项：项目料 / 常备料（按「先冲项目料、多余算常备料」拆分）
  const apProject = state.purchaseOrders.reduce((s, p) => s + poDue(p).projUnpaid, 0)
  const apStock = state.purchaseOrders.reduce((s, p) => s + poDue(p).stockUnpaid, 0)

  // 按项目分组：挂项目的一律进项目组；确实没挂项目的（库存等）单独一组
  const exGroups = []
  const map = {}
  openEx.forEach((e) => {
    const key = e.soId || '__noproj__'
    if (!map[key]) {
      const so = state.salesOrders.find((s) => s.id === e.soId)
      map[key] = { key, title: so ? so.projectName : '未挂项目（库存等）', items: [] }
      exGroups.push(map[key])
    }
    map[key].items.push(e)
  })
  exGroups.sort((a, b) => (a.key === '__noproj__' ? 1 : b.key === '__noproj__' ? -1 : 0))

  return (
    <>
      {node}
      <div className="crumb crumb-home">
        <span>首页 / 工作台</span>
        <div className="quick-drop">
          <button className="btn" onClick={() => setQuick((v) => !v)}>快捷发起 {quick ? '▴' : '▾'}</button>
          {quick && (
            <>
            <div className="quick-mask" onClick={() => setQuick(false)} />
            <div className="quick-menu">
              {[
                { color: '#e8f3ff', icon: '📋', title: '销售订单', sub: '新建', to: '/sales/new' },
                { color: '#ffece8', icon: '⚠', title: '销售异常出库', sub: '拆件未发', to: '/sales/abn' },
                { color: '#fff7e8', icon: '🛒', title: '采购入库', sub: '处理', to: '/purchase/pi' },
                { color: '#e8ffea', icon: '🏭', title: '生产管控', sub: '确认完成', to: '/production' },
                { color: '#f5e8ff', icon: '📦', title: '销售出库', sub: '待出库', to: '/sales/out' },
                { color: '#e8f3ff', icon: '🧩', title: 'BOM', sub: '确认后下采购', to: '/design/bom' },
                { color: '#fff7e8', icon: '↩', title: '采购退货', sub: '挂采购订单', to: '/purchase/return' },
                { color: '#e8ffea', icon: '💰', title: '付款登记', sub: '按供应商筛', to: '/purchase/payable' },
                { color: '#e8f3ff', icon: '🔧', title: '安装调试', sub: '确认安装', to: '/install' },
              ].map((it) => (
                <button key={it.to} className="quick-item" onClick={() => { setQuick(false); nav(it.to) }}>
                  <div className="ico" style={{ background: it.color }}>{it.icon}</div>
                  <span>
                    <b>{it.title}</b>
                    <span>{it.sub}</span>
                  </span>
                </button>
              ))}
            </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>
            异常与提醒 {topCount}
            <span className="cell-mute" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>未完结异常 + 系统实时提醒（含计划变更通知），统一在这里看</span>
          </h3>
        </div>
        {topCount === 0 && <p className="hint">当前没有未完结异常和提醒</p>}
        <div className="ex-grid">
          {exGroups.map((g) => {
            const noproj = g.key === '__noproj__'
            const no = noproj
              ? 0
              : (falls.findIndex((s) => s.id === g.key) + 1) ||
                (inProgress.findIndex((s) => s.id === g.key) + 1) ||
                (state.salesOrders.findIndex((s) => s.id === g.key) + 1)
            const name = noproj ? '未挂项目（库存等）' : `项目 ${no} · ${g.title}`
            return (
              <div key={g.key} className="ex-group">
                <div className="ex-group-h">
                  <b>{name}</b>
                  <span className="ex-group-n">{g.items.length}</span>
                </div>
                {g.items.map((e, i) => (
                  <button key={e.id} className={`ex-row ${e.level === 'red' ? 'bad' : 'warn'}`} onClick={() => nav(`/exception/${e.id}`)}>
                    <span className="ex-no">{i + 1}</span>
                    <ExLamp level={e.level} />
                    <span className="ex-proc">{exProcess(e)}</span>
                    <span className="ex-title">{e.title}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
        <div className="row-actions" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => nav('/exception')}>进入异常中心</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>未完成事项</h3>
        </div>
        <div className="grid-4">
          <button className="kpi orange" onClick={() => nav('/purchase/po')}>
            <div><span>采购未入完</span><b>{todoPo.length} 张</b></div>
          </button>
          <button className="kpi orange" onClick={() => nav('/purchase/po')}>
            <div><span>补采未到货</span><b>{todoPart.length} 单</b></div>
          </button>
          <button className="kpi blue" onClick={() => nav('/production')}>
            <div><span>生产未完成</span><b>{todoPp.length} 单</b></div>
          </button>
          <button className="kpi purple" onClick={() => nav('/sales/out')}>
            <div><span>成品待出库</span><b>{todoFgOut.length} 单</b></div>
          </button>
          <button className="kpi green" onClick={() => nav('/install/train')}>
            <div><span>未交付</span><b>{todoDeliver.length} 单</b></div>
          </button>
          <button className="kpi gray" onClick={() => nav('/purchase/return')}>
            <div><span>退货给供应商</span><b>{todoRtn.length} 单</b></div>
          </button>
          <button className="kpi red" onClick={() => nav('/purchase/payable')}>
            <div><span>项目料未付</span><b>¥ {Math.round(apProject).toLocaleString()}</b></div>
          </button>
          <button className="kpi red" onClick={() => nav('/purchase/payable')}>
            <div><span>常备料未付</span><b>¥ {Math.round(apStock).toLocaleString()}</b></div>
          </button>
        </div>
        <div className="todo-brief">
          {inProgress.map((so, i) => (
            <button key={so.id} className="todo-brief-row" onClick={() => nav(`/sales/${so.id}`)}>
              项目 {i + 1} · {so.projectName}　已收 ¥{receivedOf(so).toLocaleString()}　合同 ¥{so.amount.toLocaleString()}　预计交付 {so.dueDate}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>项目瀑布</h3>
        </div>
        <div className="row-actions" style={{ marginBottom: 12 }}>
          <Btn kind="primary" onClick={() => nav('/fall/new')}>新增瀑布计划</Btn>
          <Btn onClick={() => nav('/fall/edit')}>编辑瀑布计划</Btn>
          <Btn onClick={() => nav('/fall/done')}>已完成的瀑布计划</Btn>
          <Btn onClick={() => nav('/fall/logs')}>瀑布计划调整记录</Btn>
        </div>
        {falls.length === 0 && <p className="hint">还没有在做的项目瀑布。请先新增并确认。</p>}
        <div className="fall-grid">
          {falls.map((so, i) => (
            <FallProject key={so.id} index={i + 1} so={so} state={state} nav={nav} />
          ))}
        </div>
      </div>

    </>
  )
}

export function FallProject({ index, so, state, nav, hideHead }) {
  const [openEx, setOpenEx] = useState(false)
  const des = state.designTasks.find((d) => d.soId === so.id)
  const bom = state.boms.find((b) => b.soId === so.id)
  const pos = state.purchaseOrders.filter((p) => p.soId === so.id)
  const mainPos = pos.filter((p) => !p.part)
  const partPos = pos.filter((p) => p.part)
  const poIds = mainPos.map((p) => p.id)
  const pis = state.inboundOrders.filter((p) => poIds.includes(p.poId))
  const rtns = state.returns.filter((r) => poIds.includes(r.poId) || partPos.some((p) => p.id === r.poId))
  const rtos = state.returnOuts.filter((o) => poIds.includes(o.poId) || partPos.some((p) => p.id === o.poId))
  const pp = state.productionPlans.find((p) => p.soId === so.id)
  const out = state.outboundOrders.find((o) => o.soId === so.id)
  const punches = state.punches.filter((p) => p.soId === so.id)
  const exs = state.exceptions.filter((e) => e.soId === so.id).sort((a, b) => {
    const ao = exOpen(a) ? 0 : 1
    const bo = exOpen(b) ? 0 : 1
    if (ao !== bo) return ao - bo
    if (a.level !== b.level) return a.level === 'red' ? -1 : 1
    return 0
  })
  const archive = !!out?.trained
  const skipRobot = pp?.robot === false
  const prodOn = pp?.done
  const firstPo = mainPos[0]
  const buyStarted = mainPos.length > 0
  const inAll = mainPos.length > 0 && mainPos.every((p) => p.inboundStatus === 'all')
  const buyOn = inAll
  const buyWarn = buyStarted && !inAll
  const inWarn = mainPos.some((p) => p.inboundStatus !== 'all' && (p.inboundStatus !== 'none' || p.shipped || pis.length > 0))
  const wayOn = inAll
  const wayWarn = buyStarted && !inAll
  const due = so.fallDue || {}
  const desDue = due.design
  const buyDue = due.purchase
  // 在途：不排在规划里，改为「有已发货未入库的采购单」时自动插入；灯对照这张单的「供应商确认交期」
  const transitPos = mainPos.filter((p) => p.shipped && p.inboundStatus !== 'all' && p.closeStatus !== 'closed' && p.completeStatus !== 'done')
  const hasTransit = transitPos.length > 0
  const wayDue = (transitPos.map((p) => p.confirmEta || p.eta).filter(Boolean).sort()[0]) || ''
  const inDue = due.inbound
  const prodDue = due.assemble
  const outDue = due.outbound
  const insDue = due.install
  const trainDue = due.train || so.dueDate
  const prodReady = !!des?.done && !!bom?.confirmed && (mainPos.length === 0 || mainPos.some((p) => p.inboundStatus === 'partial' || p.inboundStatus === 'all'))
  const prodWorking = punches.length > 0 || (pp?.steps || []).some((s) => (s.progress || 0) > 0)
  const prodTimeOn = !!(due.inbound || due.structure) && daysUntil(due.inbound || due.structure) <= 0
  const prodWarn = !!pp && !prodOn && prodReady && (prodWorking || prodTimeOn)
  const wayAt = lastTime(mainPos, 'inboundDoneAt') || lastTime(pis.filter((p) => p.confirmed), 'confirmedAt')
  const inAt = lastTime(pis.filter((p) => p.confirmed), 'confirmedAt')
  const prodStart = prodStartAt(state, so.id)
  const rtnEarly = rtns.filter((r) => !prodStart || (rtnTime(r, rtos) && rtnTime(r, rtos) < prodStart))
  const rtnLate = rtns.filter((r) => !rtnEarly.includes(r))
  const partBefore = partPos.filter((p) => partSlotOf(p, out) === 'before').sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
  const partOut = partPos.filter((p) => partSlotOf(p, out) === 'out').sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
  const partInstall = partPos.filter((p) => partSlotOf(p, out) === 'install').sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
  const partBeforeAtProd = partBefore.length > 0 && !!prodStart && partBefore.some((p) => (p.createdAt || '') >= prodStart)
  const beforeProd = []
  if (rtnEarly.length) beforeProd.push({ at: earliestAt(rtnEarly, (r) => rtnTime(r, rtos)), kind: 'return', items: rtnEarly })
  if (partBefore.length && !partBeforeAtProd) beforeProd.push({ at: earliestAt(partBefore, (p) => p.createdAt), kind: 'part', items: partBefore })
  beforeProd.sort((a, b) => (a.at > b.at ? 1 : -1))
  const afterProd = []
  if (rtnLate.length) afterProd.push({ at: earliestAt(rtnLate, (r) => rtnTime(r, rtos)), kind: 'return', items: rtnLate })
  if (partBefore.length && partBeforeAtProd) afterProd.push({ at: earliestAt(partBefore, (p) => p.createdAt), kind: 'part', items: partBefore })
  afterProd.sort((a, b) => (a.at > b.at ? 1 : -1))

  function go(path) {
    nav(path)
  }

  return (
    <div className="fall-card">
      {!hideHead && (
        <div className="fall-h">
          <button className="link-plain" onClick={() => go(`/sales/${so.id}`)}>
            <b>项目 {index} · {so.projectName}</b>
          </button>
          <span>{so.id} · {nameOf(state.customers, so.customerId)}</span>
        </div>
      )}
      <div className="v-fall">
        <FallStack archive={archive} so={so} state={state} nodeKey="design" title="设计" on={des?.done} warn={!!des && !des.done} dueAt={desDue} doneAt={des?.doneAt} extra={des?.done ? '' : (des ? '资料未交' : '')} onClick={() => go(`/design/${so.id}`)} />
        <FallStack archive={archive} so={so} state={state} nodeKey="bom" title="BOM" on={bom?.confirmed} dueAt={so.fallDue?.bom || ''} doneAt={bom?.confirmedAt} extra={bom?.confirmed ? '已确认' : (bom ? '草稿' : '未建')} onClick={() => go(`/design/bom/${so.id}`)} />
        <FallStack archive={archive} so={so} state={state} nodeKey="purchase" title="采购" on={buyOn} warn={buyWarn} dueAt={buyDue} doneAt={inAll ? inAt : ''} extra={buyOn ? '' : (buyStarted ? buySideText(mainPos) : '未下单')} onClick={() => go(firstPo ? `/purchase/po/${firstPo.id}` : '/purchase/po')} />
        {hasTransit && <TransitBlock archive={archive} so={so} pos={transitPos} state={state} on={wayOn} warn={wayWarn} dueAt={wayDue} doneAt={wayAt} onGo={go} />}
        <FallStack archive={archive} so={so} state={state} nodeKey="inbound" title="入库" on={inAll} warn={!inAll && (inWarn || buyStarted)} dueAt={inDue} doneAt={inAll ? inAt : ''} extra={inAll ? '' : inboundText(mainPos, pis)} onClick={() => go('/purchase/pi')} />
        {beforeProd.map((slot) => slot.kind === 'return'
          ? <ReturnBlock key="return-early" archive={archive} rtns={slot.items} rtos={rtos} onGo={go} />
          : <PartBlock key="part-before" archive={archive} pos={slot.items} state={state} onGo={go} />)}
        <ProdBlock archive={archive} so={so} state={state} pp={pp} punches={punches} skipRobot={skipRobot} prodOn={prodOn} prodWarn={prodWarn} prodDue={prodDue} due={due} go={go} canStart={prodReady} />
        <FallStack
          archive={archive}
          so={so}
          state={state}
          nodeKey="outbound"
          title="成品入库"
          on={prodOn}
          dueAt={prodDue}
          doneAt={pp?.doneAt}
          extra={prodOn ? (out?.status === 'done' ? '' : '已入库待出库') : '未入库'}
          onClick={() => go(out ? `/sales/out/${out.id}` : '/sales/out')}
        />
        {afterProd.map((slot) => slot.kind === 'return'
          ? <ReturnBlock key="return-late" archive={archive} rtns={slot.items} rtos={rtos} onGo={go} />
          : <PartBlock key="part-prod" archive={archive} pos={slot.items} state={state} onGo={go} />)}
        <FallStack archive={archive} so={so} state={state} nodeKey="outbound" title="成品出库" on={out?.status === 'done'} warn={out?.status === 'pending'} dueAt={outDue} doneAt={out?.doneAt} extra={out ? (out.status === 'done' ? '' : '待出库') : '未生成'} onClick={() => go(out ? `/sales/out/${out.id}` : '/sales/out')} />
        <PartBlock archive={archive} pos={partOut} state={state} onGo={go} />
        <FallStack archive={archive} so={so} state={state} nodeKey="install" title="安装调试" on={out?.installed} warn={out?.signed && !out?.installed} dueAt={insDue} doneAt={out?.installedAt} extra={out?.installed ? '' : '未确认'} onClick={() => go(`/install/${so.id}`)} />
        <PartBlock archive={archive} pos={partInstall} state={state} onGo={go} />
        <FallStack archive={archive} so={so} state={state} nodeKey="train" title="培训" on={out?.trained} warn={out?.installed && !out?.trained} dueAt={trainDue} doneAt={out?.trainedAt} extra={out?.trained ? '交付完成' : '未确认'} onClick={() => go(`/install/train/${so.id}`)} />
      </div>
      <PlanHist so={so} state={state} nav={nav} />
      <LightHist so={so} state={state} />
      <div className="v-fold" style={{ marginTop: 10 }}>
        <button className="btn-mini" onClick={() => setOpenEx((v) => !v)}>本项目异常 {exs.length} {openEx ? '▾' : '›'}</button>
        {openEx && (
          <>
            {exs.length === 0
              ? <p className="hint">当前没有异常记录</p>
              : exs.map((e) => (
                <button key={e.id} className={`ex-row ${exTone(e)}`} onClick={() => go(`/exception/${e.id}`)}>
                  <ExLamp level={e.level} />
                  <span className="ex-proc">{exProcess(e)}</span>
                  <span className="ex-title">{e.title}</span>
                  {exStateTag(e)}
                </button>
              ))}
            <button className="btn" style={{ marginTop: 8 }} onClick={() => go(`/exception?soId=${so.id}&st=all`)}>进入异常中心（本项目）</button>
          </>
        )}
      </div>
    </div>
  )
}

function ProdBlock({ archive, so, state, pp, punches, skipRobot, prodOn, prodWarn, prodDue, due, go, canStart }) {
  const [open, setOpen] = useState(() => !!(prodOn || prodWarn || punches.length))
  const stepNames = skipRobot ? ['结构', '电路', '装配'] : ['结构', '电路', '机器人', '装配']
  const status = fallProgress({ on: prodOn, warn: prodWarn, dueAt: canStart ? prodDue : '', doneAt: pp?.doneAt, archive })
  const delay = fallDelay({ on: prodOn, dueAt: canStart ? prodDue : '', maybeDays: maybeDaysOf(state, 'assemble'), archive })
  const shifted = ['structure', 'circuit', 'robot', 'assemble']
    .map((k) => nodeShifted(state, so.id, k))
    .filter(Boolean)
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0] || null
  return (
    <div className={`v-node st-${delay || status}`}>
      <NodeLine
        archive={archive}
        title="生产管控"
        status={status}
        delay={delay}
        dueAt={prodDue}
        doneAt={pp?.doneAt}
        extra={pp ? '' : '未建计划'}
        shifted={shifted}
        titleNode={<button className="link-plain v-title" onClick={() => go(pp ? `/production/${pp.id}` : '/production')}>生产管控</button>}
        actions={pp ? <button className="btn-mini" onClick={() => setOpen((v) => !v)}>{open ? '收起' : '展开'}</button> : null}
      />
      {open && pp && (
        <div className="v-fall nested">
          {stepNames.map((name) => (
            <ProdStep
              key={name}
              archive={archive}
              name={name}
              st={pp?.steps?.find((s) => s.name === name)}
              punches={punches.filter((p) => p.step === name)}
              done={!!prodOn}
              dueAt={due[STEP_DUE[name]]}
              shifted={nodeShifted(state, so.id, STEP_DUE[name])}
              state={state}
              canStart={canStart}
              onGo={() => go(pp ? `/production/${pp.id}` : '/production')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProdStep({ archive, name, st, punches, done, dueAt, shifted, state, onGo, canStart }) {
  const [open, setOpen] = useState(punches.length > 0)
  const prog = st?.progress || 0
  const on = done || prog >= 100
  const warn = !done && prog > 0 && prog < 100
  const status = !canStart && !on
    ? 'wait'
    : fallProgress({ on, warn, dueAt, doneAt: st?.doneAt, archive })
  const delay = !canStart && !on
    ? ''
    : fallDelay({ on, dueAt, maybeDays: maybeDaysOf(state, STEP_DUE[name]), archive })
  return (
    <div className={`v-node st-${delay || status}`}>
      <NodeLine
        archive={archive}
        title={name}
        status={status}
        delay={delay}
        dueAt={dueAt}
        doneAt={st?.doneAt}
        shifted={shifted}
        titleNode={<button className="link-plain v-title" onClick={onGo}>{name}</button>}
        actions={<button className="btn-mini" onClick={() => setOpen((v) => !v)}>{open ? '收起' : '展开'}</button>}
      />
      {open && (
        punches.length === 0
          ? <p className="hint">这一步还没有打卡</p>
          : [...punches].sort(byAtDesc).map((p) => {
            const risk = punchRisk(state, p)
            return (
              <button key={p.id} className={`punch-row ${risk ? `punch-${risk}` : ''}`} onClick={onGo}>
                <div className="punch-left">
                  {punchRiskNote(risk)}
                  <b>{p.by}</b>
                  <span>{p.note}</span>
                </div>
                <div className="punch-right">
                  <span className="punch-at">{String(p.at || '').replace('T', ' ').slice(0, 16)}</span>
                  <b className="punch-pct">{p.progress}%</b>
                </div>
              </button>
            )
          })
      )}
    </div>
  )
}

function PlanHist({ so, state, nav }) {
  const [open, setOpen] = useState(false)
  const rows = (state.fallAdjusts || []).filter((a) => a.soId === so.id)
  if (rows.length === 0) return null
  const batches = groupAdjusts(rows)
  return (
    <div className="v-fold" style={{ marginTop: 10 }}>
      <button className="btn-mini" onClick={() => setOpen((v) => !v)}>
        排期调整 {batches.length} 次{open ? ' ▾' : ' ›'}
      </button>
      {open && batches.map((b) => (
        <div key={b.at + b.reason} className="plan-hist">
          <div className="plan-hist-h">
            <b>{b.at}</b>
            <span>{b.by}</span>
            <span>{b.items.length === 1 ? '只改了该环节' : `一次改了 ${b.items.length} 个环节`}</span>
          </div>
          {b.reason ? <p className="hint">原因：{b.reason}</p> : null}
          {b.items.map((it) => {
            const flag = adjustFlag(it)
            return (
              <div key={it.id} className="plan-hist-row">
                <b>{it.nodeLabel}</b>
                <span>{dayOf(it.from)} → {dayOf(it.to)}</span>
                {flag ? <span className="plan-hist-flag">{flag}</span> : null}
              </div>
            )
          })}
        </div>
      ))}
      {open && (
        <button className="btn" style={{ marginTop: 8 }} onClick={() => nav('/fall/logs')}>查看全部调整记录</button>
      )}
    </div>
  )
}

/** 黄红灯历史：改计划 / 回调都不抹掉已经亮过的灯，算绩效用 */
function LightHist({ so, state }) {
  const [open, setOpen] = useState(false)
  const rows = lightLogsOf(state, so.id).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)))
  if (rows.length === 0) return null
  const red = rows.filter((r) => r.tone === 'red').length
  return (
    <div className="v-fold" style={{ marginTop: 10 }}>
      <button className="btn-mini" onClick={() => setOpen((v) => !v)}>
        黄红灯历史 {rows.length} 条{red ? `（红 ${red}）` : ''}{open ? ' ▾' : ' ›'}
      </button>
      {open && rows.map((r) => (
        <div key={r.id} className="plan-hist-row">
          <b>{r.nodeLabel || '—'}</b>
          <span>{r.tone === 'red' ? '红灯' : '黄灯'} · 计划 {r.planAt || '—'}{r.newPlanAt ? ` → ${r.newPlanAt}` : ''}</span>
          <span className="cell-mute">{String(r.at || '').replace('T', ' ').slice(0, 16)} {r.by}</span>
        </div>
      ))}
      {open && <p className="hint">灯亮过就算数，调期不会抹掉，用于事后看哪些环节经常拖。</p>}
    </div>
  )
}

function groupAdjusts(rows) {
  const list = []
  const map = new Map()
  rows.forEach((r) => {
    const key = `${r.at}|${r.reason}|${r.by}`
    if (!map.has(key)) {
      const batch = { at: r.at, reason: r.reason, by: r.by, items: [] }
      map.set(key, batch)
      list.push(batch)
    }
    map.get(key).items.push(r)
  })
  return list.sort((a, b) => (a.at < b.at ? 1 : -1))
}

function adjustFlag(item) {
  if (item.risk === 'overdue') return '当时延期'
  if (item.risk === 'maybe') return '当时即将延期'
  return ''
}

function exTone(e) {
  if (!exOpen(e)) return 'done'
  return e.level === 'red' ? 'bad' : 'warn'
}

function ExLamp({ level }) {
  const red = level === 'red'
  const glass = red ? '#f53f3f' : '#faad14'
  const rim = red ? '#a61b1b' : '#ad6800'
  const shine = red ? '#ffc4bf' : '#fff7e8'
  return (
    <svg className="ex-lamp" viewBox="0 0 16 20" aria-label={red ? '红灯' : '黄灯'}>
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

function exStateTag(e) {
  if (e.closeStatus === 'closed' && e.doneStatus !== 'done') return <Tag>已关闭</Tag>
  if (e.doneStatus === 'done') return <Tag color="green">已完结</Tag>
  return <Tag color="orange">待处理</Tag>
}

/** 打卡记录只描述「当时的情况」，不再挂状态标签（状态是节点上的事，不是日志上的事） */
function punchRiskNote(risk) {
  if (risk === 'overdue' || risk === 'late') return <span className="cell-mute punch-note">当天落后计划</span>
  if (risk === 'maybe') return <span className="cell-mute punch-note">当天接近计划线</span>
  return null
}

function byAtDesc(a, b) {
  return String(a.at || '') < String(b.at || '') ? 1 : -1
}

function TransitBlock({ archive, so, pos, state, on, warn, dueAt, doneAt, onGo }) {
  const [open, setOpen] = useState(pos.length > 0)
  const bad = pos.filter((p) => poIsAbnormal(state, p)).length
  return (
    <FallStack
      archive={archive}
      so={so}
      state={state}
      nodeKey="transit"
      title="在途"
      on={on}
      warn={warn}
      dueAt={dueAt}
      doneAt={on ? doneAt : ''}
      extra={warn ? `${pos.length} 单${bad ? ` · ${bad} 单异常` : ''}` : ''}
      render={(row, key) => (
        <div key={key} className={`v-node st-${row.delay || row.status} ${row.keep ? 'keep' : ''}`}>
          <NodeLine
            title="在途"
            status={row.status}
            delay={row.delay}
            dueAt={row.dueAt}
            doneAt={row.doneAt}
            extra={row.keep ? '' : (warn ? `${pos.length} 单${bad ? ` · ${bad} 单异常` : ''}` : '')}
            shifted={row.shifted}
            archive={row.archive}
            titleNode={<button className="link-plain v-title" onClick={() => onGo('/purchase/po?tab=wait')}>在途</button>}
            actions={!row.keep && pos.length > 0 ? <button className="btn-mini" onClick={() => setOpen((v) => !v)}>{open ? '收起' : '展开'}</button> : null}
          />
          {!row.keep && open && pos.map((po) => {
            const channel = poChannel(state, po)
            const abnormal = poIsAbnormal(state, po)
            const sup = nameOf(state.suppliers, po.supplierId)
            return (
              <button
                key={po.id}
                className={`po-way ${abnormal ? 'bad' : ''}`}
                onClick={() => onGo(`/purchase/po/${po.id}`)}
              >
                <div className="po-way-main">
                  <div className="po-way-left">
                    <div className="po-way-h"><b>{po.id}</b></div>
                    <span>{sup} · {channel}</span>
                    <span>{poWayLabel(po, channel)} · {abnormal ? '异常' : '正常'}</span>
                  </div>
                  <div className="v-times">
                    <div>预计到货 {po.eta || '未填'}</div>
                    {po.shippedAt ? <div>发货 {dayOf(po.shippedAt)}</div> : null}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    />
  )
}

function FallStack({ archive, so, state, nodeKey, title, on, warn, dueAt, doneAt, extra, onClick, render }) {
  const maybeDays = maybeDaysOf(state, nodeKey)
  const status = fallProgress({ on, warn, dueAt, doneAt, archive })
  const delay = fallDelay({ on, dueAt, maybeDays, archive })
  const shifted = nodeShifted(state, so.id, nodeKey)
  const current = { keep: false, status, delay, dueAt, doneAt, title, shifted, archive }
  if (render) return render(current, `${nodeKey}-now`)
  return (
    <FallNode
      archive={archive}
      title={title}
      status={status}
      delay={delay}
      dueAt={dueAt}
      doneAt={doneAt}
      extra={extra}
      shifted={shifted}
      onClick={onClick}
    />
  )
}

/** 该节点有没有被调过期：有就返回最近一条调期记录（是"事件"，不当状态标签用） */
function nodeShifted(state, soId, nodeKey) {
  const rows = (state.fallAdjusts || []).filter((a) => a.soId === soId && a.nodeKey === nodeKey)
  if (!rows.length) return null
  return [...rows].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0]
}

function nodeShiftText(shift) {
  if (!shift) return ''
  const from = dayOf(shift.from)
  const to = dayOf(shift.to)
  return from && to ? `调期 ${from} → ${to}` : '调期过'
}

function FallNode({ title, extra, onClick, dueAt, doneAt, status, delay, keep, shifted, archive }) {
  const cls = `v-node st-${delay || status} ${keep ? 'keep' : ''} ${onClick ? 'clickable' : ''}`
  const body = <NodeLine archive={archive} title={title} status={status} delay={delay} dueAt={dueAt} doneAt={doneAt} extra={extra} shifted={shifted} />
  if (!onClick) return <div className={cls}>{body}</div>
  return (
    <button type="button" className={cls} onClick={onClick}>
      {body}
    </button>
  )
}

function NodeLine({ title, status, delay, dueAt, doneAt, extra, titleNode, actions, shifted, archive }) {
  return (
    <div className="v-node-main">
      <div className="v-head">
        {titleNode || <span className="v-title">{title}</span>}
        <FallTag status={status} archive={archive} />
        <DelayWarn delay={delay} archive={archive} />
      </div>
      <div className="v-right">
        <div className="v-times">
          {dueAt ? <div>预计 {dayOf(dueAt)}</div> : null}
          {doneAt ? (
            <div className={status === 'late' ? 'v-time-late' : ''}>
              已完成 {dayOf(doneAt)}
              {status === 'late' ? `（晚 ${daysBetween(dueAt, doneAt)} 天）` : ''}
            </div>
          ) : null}
          {!doneAt && extra ? <div>{extra}</div> : null}
          {shifted ? <div className="v-shift" title="计划变更记录">调期 {nodeShiftText(shifted).replace('调期 ', '')}</div> : null}
        </div>
        {actions}
      </div>
    </div>
  )
}

function dayOf(s) {
  if (!s) return ''
  return String(s).replace('T', ' ').slice(0, 10)
}

function FallTag({ status, archive }) {
  if (archive && status !== 'late') return null
  const map = {
    wait: ['未开始', 'gray'],
    doing: ['进行中', 'blue'],
    done: ['已完成', 'mute'],
    // 晚完成也统一叫「已完成」——晚几天写在右边的完成日期上，不再造一个"超期完成"的新词
    late: ['已完成', 'mute'],
  }
  const [text, color] = map[status] || ['未开始', 'gray']
  return <Tag color={color}>{text}</Tag>
}

function DelayWarn({ delay, archive }) {
  if (archive || !delay) return null
  if (delay === 'overdue') return <Tag color="red">延期</Tag>
  if (delay === 'maybe') return <Tag color="orange">即将延期</Tag>
  return null
}

function fallProgress({ on, warn, dueAt, doneAt, archive }) {
  if (archive) {
    if (doneAt || on) return isLate(dueAt, doneAt) ? 'late' : 'done'
    return 'done'
  }
  if (on) return isLate(dueAt, doneAt) ? 'late' : 'done'
  if (warn) return 'doing'
  return 'wait'
}

function fallDelay({ on, dueAt, maybeDays, archive }) {
  if (archive || on || !dueAt) return ''
  const days = daysUntil(dueAt)
  if (days <= 0) return 'overdue'
  if (maybeDays != null && days <= maybeDays) return 'maybe'
  return ''
}

function maybeDaysOf(state, key) {
  const cfg = reminderOf(state, key)
  if (!cfg.yellowOn || cfg.yellowDays <= 0) return null
  return cfg.yellowDays
}

function daysUntil(dueAt) {
  const day = String(dueAt).replace('T', ' ').slice(0, 10)
  const t = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const today = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
  return Math.round((Date.parse(`${day}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86400000)
}

const STEP_DUE = { 结构: 'structure', 电路: 'circuit', 机器人: 'robot', 装配: 'assemble' }

function isLate(dueAt, doneAt) {
  if (!dueAt || !doneAt) return false
  return stamp(doneAt) > stamp(dueAt)
}

function stamp(s) {
  const x = String(s).trim().replace('T', ' ')
  if (x.length === 10) return `${x} 23:59:59`
  if (x.length === 16) return `${x}:00`
  return x
}

function lastTime(list, key) {
  const times = (list || []).map((x) => x[key]).filter(Boolean).sort()
  return times[times.length - 1] || ''
}

function poChannel(state, po) {
  const s = state.suppliers.find((x) => x.id === po.supplierId)
  return s?.type === '网购' ? '网购' : '供应商'
}

function poWayLabel(po, channel) {
  if (po.inboundStatus === 'all') return '已入库'
  if (po.inboundStatus === 'partial') return '部分到货'
  if (po.shipped) return '已发货在途'
  return channel === '网购' ? '网购未发货' : '供应商生产中'
}

function partDest(po) {
  return po.address === '本厂' ? '发到工厂' : '发到客户'
}

function partWayLabel(po, channel) {
  if (po.inboundStatus === 'all') return po.address === '本厂' ? '已入库' : '已签收'
  return poWayLabel(po, channel)
}

function partPoDone(po) {
  return po.inboundStatus === 'all'
}

function poIsAbnormal(state, po) {
  if (state.exceptions.some((e) => exOpen(e) && e.poId === po.id)) return true
  if (po.inboundStatus === 'all') return false
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  return !!(po.eta && po.eta < day)
}

/**
 * 「入库」节点专用文案：只说**到货/入库**这一件事。
 * （「采购」节点只说下单和供应商侧情况，两边不重复 —— 以前两个节点都写"部分入库·N 张入库单"）
 */
function inboundText(pos, pis) {
  if (!pos.length) return '未下采购订单'
  if (pos.every((p) => p.inboundStatus === 'all')) return '已全部入库'
  const ok = pis.filter((p) => p.confirmed).length
  if (ok || pos.some((p) => p.inboundStatus === 'partial')) return `已入库 ${ok} 张单，未到齐`
  if (pos.some((p) => p.shipped)) return '在途，尚未入库'
  return '未入库'
}

/** 「采购」节点专用文案：只说下单与供应商侧情况（已发/未发） */
function buySideText(pos) {
  if (!pos.length) return '未下单'
  const shipped = pos.filter((p) => p.shipped).length
  return `${pos.length} 单 · 供应商已发 ${shipped} / 未发 ${pos.length - shipped}`
}

function returnText(rtns, rtos) {
  if (!rtns.length) return '无退货'
  const last = rtns[0]
  const rto = rtos.find((o) => o.rtnId === last.id)
  if (rto?.signed) return `${last.id} · 供应商已签收`
  if (rto?.status === 'done') return `${last.id} · 退货在途`
  if (last.confirmStatus === 'confirmed') return `${last.id} · 待退货出库`
  return `${last.id} · 草稿`
}

function prodStartAt(state, soId) {
  const times = state.punches.filter((p) => p.soId === soId).map((p) => p.at).filter(Boolean).sort()
  return times[0] || ''
}

function rtnTime(rtn, rtos) {
  const rto = (rtos || []).find((o) => o.rtnId === rtn.id)
  return rtn.createdAt || rto?.createdAt || rto?.signedAt || ''
}

function earliestAt(list, pick) {
  const times = (list || []).map(pick).filter(Boolean).sort()
  return times[0] || ''
}

function ReturnBlock({ archive, rtns, rtos, onGo }) {
  if (!rtns.length) return null
  const ids = rtns.map((r) => r.id)
  const mine = rtos.filter((o) => ids.includes(o.rtnId))
  const rtnOn = mine.length > 0 && mine.every((o) => o.signed)
  const rtnWarn = !rtnOn
  const rtnAt = lastTime(mine.filter((o) => o.signed), 'signedAt')
  return (
    <FallNode
      archive={archive}
      title="退货给供应商"
      status={fallProgress({ on: rtnOn, warn: rtnWarn, archive })}
      doneAt={rtnOn ? rtnAt : ''}
      extra={returnText(rtns, mine)}
      onClick={() => onGo('/purchase/return')}
    />
  )
}

function partSlotOf(po, out) {
  const t = po.createdAt || ''
  if (out?.installedAt && t >= out.installedAt) return 'install'
  if (out?.doneAt && t >= out.doneAt) return 'out'
  return 'before'
}

function partPoKind(po, maybeDays) {
  if (partPoDone(po)) {
    if (po.eta && po.inboundDoneAt && dayOf(po.inboundDoneAt) > dayOf(po.eta)) return 'late'
    return 'ok'
  }
  if (!po.eta) return 'pending'
  const days = daysUntil(po.eta)
  if (days <= 0) return 'overdue'
  if (maybeDays != null && days <= maybeDays) return 'maybe'
  return 'pending'
}

function partLeftStatus(po, channel, kind) {
  if (kind === 'ok' || kind === 'late') {
    const dest = po.address === '本厂' ? '已入库' : '已签收'
    if (kind === 'late') {
      const late = daysBetween(po.eta, po.inboundDoneAt)
      return `晚到货${late ? ` ${late} 天` : ''} · ${dest}`
    }
    return `按期到货 · ${dest}`
  }
  return partWayLabel(po, channel)
}

function daysBetween(from, to) {
  if (!from || !to) return 0
  const a = new Date(`${dayOf(from)}T00:00:00`)
  const b = new Date(`${dayOf(to)}T00:00:00`)
  return Math.max(0, Math.round((b - a) / 86400000))
}

/** 补件采购节点的状态标签（备用：现在只在节点内行使用） */
function partRiskTag(kind) {
  if (kind === 'late') return <Tag color="mute">已完成</Tag>
  if (kind === 'ok') return <Tag color="mute">已完成</Tag>
  if (kind === 'overdue') return <Tag color="red">延期</Tag>
  if (kind === 'maybe') return <Tag color="orange">即将延期</Tag>
  return null
}

function partBlockPair(pos, state, archive) {
  const allDone = pos.every(partPoDone)
  const maybeDays = maybeDaysOf(state, 'purchase')
  const kinds = pos.map((p) => partPoKind(p, maybeDays))
  const status = (archive || allDone) ? (kinds.includes('late') ? 'late' : 'done') : 'doing'
  let delay = ''
  if (!archive && !allDone) {
    if (kinds.includes('overdue')) delay = 'overdue'
    else if (kinds.includes('maybe')) delay = 'maybe'
  }
  return { status, delay }
}

function PartBlock({ archive, pos, state, onGo }) {
  if (!pos.length) return null
  const allDone = pos.every(partPoDone)
  const { status, delay } = partBlockPair(pos, state, archive)
  const doneAt = allDone ? lastTime(pos, 'inboundDoneAt') : ''
  const maybeDays = maybeDaysOf(state, 'purchase')
  return (
    <div className={`v-node st-${delay || status}`}>
      <NodeLine
        archive={archive}
        title="补件采购"
        status={status}
        delay={delay}
        doneAt={doneAt}
        extra={`${pos.length} 单`}
        titleNode={<button className="link-plain v-title" onClick={() => onGo(`/purchase/po/${pos[0].id}`)}>补件采购</button>}
      />
      {pos.map((po) => {
        const channel = poChannel(state, po)
        const kind = partPoKind(po, maybeDays)
        const tone = kind === 'maybe' ? 'maybe' : (kind === 'overdue' || kind === 'late' ? 'bad' : '')
        return (
          <button key={po.id} className={`po-way ${tone}`} onClick={() => onGo(`/purchase/po/${po.id}`)}>
            <div className="po-way-main">
              <div className="po-way-left">
                <div className="po-way-h">
                  {partRiskTag(kind)}
                  <b>{po.id}</b>
                </div>
                <span>{channel} · {partDest(po)}</span>
                <span>{partLeftStatus(po, channel, kind)}</span>
              </div>
              <div className="v-times">
                <div>下单 {dayOf(po.createdAt) || '—'}</div>
                <div>预计到货 {po.eta || '未填'}</div>
                <div>实际 {partPoDone(po) ? (dayOf(po.inboundDoneAt) || '已到货') : '未到货'}</div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

