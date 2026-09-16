import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PP_STEP_DUE, nameOf, ppDocStatus, ppDocStatusLabel, ppDueDiffs, ppShortage, prodRiskTone, punchRisk, useStore } from '../store'
import { Btn, DocStatus, Field, Filters, matchDelay, Modal, OpsLinks, Page, ProgressLamp, Table, Tabs, Tag, useDialog } from '../ui'
import { useExReport } from '../exReport'
import { usePlanNotice } from '../planNotice'

/**
 * 确认完工的两级弹窗，列表页和详情页共用：
 * 一级 确认完工 → 二级 告知已成品入库。
 */
function useCompleteFlow({ state, actions, flash }) {
  const [target, setTarget] = useState(null)
  const [inbound, setInbound] = useState(null)
  const shortage = target ? ppShortage(state, target.soId) : []

  function doComplete() {
    const pp = target
    const so = state.salesOrders.find((s) => s.id === pp?.soId)
    const bom = state.boms.find((b) => b.soId === pp?.soId)
    const r = actions.completePP(pp.soId)
    setTarget(null)
    if (!r.ok) {
      flash(r)
      return
    }
    setInbound({
      name: r.fgName || so?.productName || '成品',
      qty: r.fgQty || Number(bom?.qty || 1),
      outId: r.outId,
      message: r.message,
    })
  }

  const node = (
    <>
      {target && (
        <Modal
          title={shortage.length ? '确认完工（原料不足）' : '确认完工'}
          okText={shortage.length ? '仍要完工' : '确认完工'}
          onCancel={() => setTarget(null)}
          onOk={doComplete}
        >
          <p>
            确认后「{state.salesOrders.find((s) => s.id === target.soId)?.projectName || target.soId}」的生产就完工了：
            {state.salesOrders.find((s) => s.id === target.soId)?.productName || '成品'}{' '}
            {Number(state.boms.find((b) => b.soId === target.soId)?.qty || 1)} 台会自动入库，并生成一张待出库的销售出库单。
          </p>
          {shortage.length > 0 && (
            <div className="hint" style={{ borderLeft: '3px solid #d4380d', paddingLeft: 10 }}>
              <p><b>以下原料可用不足</b>，完工后会被扣成负库存，并写入一条缺料异常提醒盘点：</p>
              <ul>
                {shortage.map((s) => (
                  <li key={s.productId}>{s.name}：需要 {s.need}，可用 {s.have}，缺 {s.short}{s.unit}</li>
                ))}
              </ul>
              <p>建议先去「库存 / 盘点」把账调平，或先补料再完工。</p>
            </div>
          )}
          <p className="hint">还没打完的工序进度会一并置为 100%。原料不够时允许先完工，同时写一条缺料异常提醒盘点。</p>
        </Modal>
      )}
      {inbound && (
        <Modal title="已成品入库" okText="知道了" onCancel={() => setInbound(null)} onOk={() => setInbound(null)}>
          <p>{inbound.name} {inbound.qty} 台已自动入库，成品可用库存已增加。</p>
          <p>
            {inbound.outId
              ? `同时生成了销售出库单 ${inbound.outId}（待出库），可以直接去确认出库。`
              : '同时生成了待出库的销售出库单。'}
          </p>
          <p className="hint">{inbound.message}</p>
        </Modal>
      )}
    </>
  )

  return { node, start: setTarget }
}

export function PlanList() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const [tab, setTab] = useState('all')
  const [soId, setSoId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [delay, setDelay] = useState('')
  const complete = useCompleteFlow({ state, actions, flash })
  const notice = usePlanNotice()
  const sos = state.salesOrders.filter((s) => s.confirmStatus === 'confirmed' && s.closeStatus !== 'closed')

  const counts = useMemo(() => {
    const all = state.productionPlans
    return {
      all: all.length,
      draft: all.filter((r) => ppDocStatus(r) === 'draft').length,
      running: all.filter((r) => ppDocStatus(r) === 'running').length,
      done: all.filter((r) => ppDocStatus(r) === 'done').length,
    }
  }, [state.productionPlans])

  const rows = state.productionPlans.filter((r) => {
    const so = state.salesOrders.find((s) => s.id === r.soId)
    if (tab !== 'all' && ppDocStatus(r) !== tab) return false
    if (soId && r.soId !== soId) return false
    if (customerId && so?.customerId !== customerId) return false
    if (!matchDelay(prodDelayTone(state, r), delay)) return false
    return true
  })
  return (
    <Page crumb={<>生产管理 / 生产管控</>}>
      {node}
      {complete.node}
      {notice.node}
      <div className="card">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { key: 'all', label: '全部', count: counts.all },
            { key: 'draft', label: '草稿', count: counts.draft },
            { key: 'running', label: '进行中', count: counts.running },
            { key: 'done', label: '已完成', count: counts.done },
          ]}
        />
        <Filters onQuery={() => {}} onReset={() => { setSoId(''); setCustomerId(''); setDelay('') }}>
          <Field label="项目">
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">全部项目</option>
              {state.salesOrders.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
          <Field label="客户">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">全部</option>
              {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="生产交期预警">
            <select value={delay} onChange={(e) => setDelay(e.target.value)}>
              <option value="">全部</option>
              <option value="ok">正常</option>
              <option value="maybe">即将延期</option>
              <option value="overdue">延期</option>
            </select>
          </Field>
        </Filters>
        <Table
          columns={[
            { key: 'id', title: '计划', link: true },
            {
              key: 'progress',
              title: '进度',
              // 四步可能同时都在跑，这里只给一个红/黄/绿灯；做到哪一步看下一列「工序」
              render: (r) => {
                const k = ppDocStatus(r)
                if (k === 'draft') return '—'
                return <ProgressLamp tone={k === 'done' ? '' : prodDelayTone(state, r)} />
              },
            },
            { key: 'detail', title: '工序', render: (r) => stepProgressText(r) },
            {
              key: 'doc',
              title: '单据状态',
              // 与顶部页签同一套说法：草稿 / 进行中 / 已完成
              render: (r) => <DocStatus value={ppDocStatusLabel(ppDocStatus(r))} />,
            },
            { key: 'proj', title: '项目', render: (r) => nameOf(state.salesOrders, r.soId, 'projectName') },
            { key: 'qty', title: '台数', render: (r) => state.boms.find((b) => b.soId === r.soId)?.qty || '—' },
            { key: 'robot', title: '机器人', render: (r) => (r.robot === false ? '已跳过' : '有') },
            {
              key: 'act',
              title: '操作',
              render: (r) => {
                const k = ppDocStatus(r)
                return (
                  <OpsLinks
                    items={[
                      k === 'draft' && { label: '编辑', onClick: () => nav(`/production/${r.id}/edit`) },
                      k === 'draft' && {
                        label: '删除',
                        onClick: () => ask('删除计划草稿', '只有草稿能直接删除，删除后不再出现在列表，并记入操作记录。', () => actions.deletePlanDraft(r.id)),
                      },
                      k === 'draft' && {
                        label: '确认计划',
                        onClick: () => ask('确认生产计划', '确认后计划只能查看，要改就得走「变更」。确认前请核对各步骤完成日。', () => {
                          const res = actions.confirmPPPlan(r.id)
                          if (res.ok) {
                            notice.open({
                              desc: `已确认「${r.soId}」的生产计划，要不要把这次排期通知相关同事？`,
                              employees: state.employees,
                              onSend: (ids) => actions.sendPlanNotice(ids, {
                                scope: '生产计划',
                                soId: r.soId,
                                title: `生产计划确认 · ${r.soId}`,
                                detail: '生产计划已确认，后续按此排期执行。',
                              }),
                              onDone: () => nav(`/production/${r.id}`),
                            })
                          }
                          return res
                        }),
                      },
                      k === 'running' && { label: '变更', onClick: () => nav(`/production/${r.id}/edit?mode=change`) },
                      k === 'running' && { label: '确认完工', onClick: () => complete.start(r) },
                      { label: '详情', onClick: () => nav(`/production/${r.id}`) },
                    ]}
                  />
                )
              },
            },
          ]}
          onRow={(r) => nav(`/production/${r.id}`)}
          rows={rows}
        />
        <div className="row-actions" style={{ marginTop: 12 }}>
          {sos.filter((s) => !state.productionPlans.some((p) => p.soId === s.id)).map((s) => (
            <Btn key={s.id} onClick={() => ask('建生产计划', `将为「${s.projectName}」创建生产计划，并按里程碑计划带出结构 / 电路 / 机器人 / 装配四步的计划完成日。建完还能再编辑。确定创建吗？`, () => actions.savePlan(s.id, true))}>为 {s.projectName} 建计划</Btn>
          ))}
        </div>
      </div>
    </Page>
  )
}

export function PlanEdit() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const pp = state.productionPlans.find((p) => p.id === id)
  const so = state.salesOrders.find((s) => s.id === pp?.soId)
  const isChange = sp.get('mode') === 'change' || pp?.confirmStatus === 'confirmed'
  const notice = usePlanNotice()
  const [skipRobot, setSkipRobot] = useState(pp?.robot === false)
  /** 局部计划没排过的步骤，自动带入项目总计划（首页瀑布流）的日期，在此基础上改 */
  const [steps, setSteps] = useState(() => (pp?.steps || []).map((s) => ({
    ...s,
    date: s.date || (so?.fallDue || {})[PP_STEP_DUE[s.name]] || '',
  })))
  const [reason, setReason] = useState('')
  const [diffOpen, setDiffOpen] = useState(false)
  if (!pp) return <p>不存在</p>

  const diffs = ppDueDiffs(state, pp.soId, steps)
  const due = so?.fallDue || {}

  function setStep(name, k, v) {
    setSteps((list) => list.map((s) => (s.name === name ? { ...s, [k]: v } : s)))
  }

  /** 保存前先对着总计划比一遍，不一致就弹窗让老崔决定要不要同步 */
  function save() {
    if (isChange && !reason.trim()) {
      flash({ ok: false, message: '走变更流程要填变更原因' })
      return
    }
    if (diffs.length) {
      setDiffOpen(true)
      return
    }
    commit(false)
  }

  function commit(syncDue) {
    const run = () => {
      if (isChange) {
        const r = actions.changePPPlan(id, { skipRobot, steps }, reason)
        if (r.ok && syncDue) actions.syncPlanToFallDue(pp.soId, steps)
        return r
      }
      const r = actions.savePlanSteps(id, { skipRobot, steps })
      if (r.ok && syncDue) actions.syncPlanToFallDue(pp.soId, steps)
      return r
    }
    ask(
      syncDue ? '同步调整项目总计划' : (isChange ? '确认变更生产计划' : '保存生产计划草稿'),
      syncDue
        ? `把这次的生产步骤日期同步到项目总计划（${diffs.map((d) => d.name).join('、')}）。首页瀑布流按新日期算交期预警。`
        : (isChange ? '变更会留下记录，首页瀑布流按新日期算交期预警。' : '保存为草稿，确认后计划只能查看。'),
      () => {
        const r = run()
        if (r.ok) {
          notice.open({
            desc: `已${isChange ? '变更' : '保存'}「${so?.projectName || pp.soId}」的生产计划，要不要把这次排期通知相关同事？`,
            employees: state.employees,
            onSend: (ids) => actions.sendPlanNotice(ids, {
              scope: '生产计划',
              soId: pp.soId,
              title: `生产计划${isChange ? '变更' : '调整'} · ${so?.projectName || pp.soId}`,
              detail: isChange && reason ? `变更原因：${reason}` : '',
            }),
            onDone: () => nav(`/production/${id}`),
          })
        }
        return r
      },
    )
  }

  return (
    <Page
      crumb={<>生产管理 / 生产管控 / {isChange ? '变更' : '编辑'}</>}
      title={`${isChange ? '变更生产计划' : '编辑生产计划'} · ${so?.projectName || id}`}
      extra={<Btn onClick={() => nav(`/production/${id}`)}>返回详情</Btn>}
    >
      {node}
      {notice.node}
      <div className="card">
        <p className="hint">
          按顺序填写结构、电路、机器人、装配的计划完成日和目标进度。不需要机器人时勾选跳过。
          没排过的步骤已自动带入项目总计划（首页瀑布流）的日期，你可以在它基础上改。
        </p>
        <div className="v-fall">
          {['结构', '电路', '机器人', '装配'].map((name) => {
            const st = steps.find((s) => s.name === name) || { name, date: '', target: 0 }
            const dueDate = due[PP_STEP_DUE[name]] || ''
            const off = !!(st.date && dueDate && st.date !== dueDate)
            const head = (
              <>
                <h4>{name}</h4>
                {dueDate && <span className="hint" style={{ marginLeft: 8 }}>项目总计划 {dueDate}</span>}
                {off && <Tag color="orange">与总计划不一致</Tag>}
              </>
            )
            if (name === '机器人') {
              return (
                <div key="机器人" className={`v-node ${skipRobot ? '' : 'warn'}`}>
                  <div className="step-edit">
                    <div className="row-actions" style={{ alignItems: 'center', gap: 8 }}>{head}</div>
                    <label className="check-row">
                      <input type="checkbox" checked={skipRobot} onChange={(e) => setSkipRobot(e.target.checked)} />
                      跳过本步（勾选后该流程没有了）
                    </label>
                    {!skipRobot && (
                      <div className="filters">
                        <Field label="计划完成日">
                          <input type="date" value={st.date || ''} onChange={(e) => setStep('机器人', 'date', e.target.value)} />
                        </Field>
                        <Field label="完成目标 %">
                          <input type="number" min="0" max="100" value={st.target} onChange={(e) => setStep('机器人', 'target', Number(e.target.value))} />
                        </Field>
                      </div>
                    )}
                  </div>
                </div>
              )
            }
            return (
              <div key={name} className={`v-node ${off ? 'warn' : ''}`}>
                <div className="step-edit">
                  <div className="row-actions" style={{ alignItems: 'center', gap: 8 }}>{head}</div>
                  <div className="filters">
                    <Field label="计划完成日">
                      <input type="date" value={st.date || ''} onChange={(e) => setStep(name, 'date', e.target.value)} />
                    </Field>
                    <Field label="完成目标 %">
                      <input type="number" min="0" max="100" value={st.target} onChange={(e) => setStep(name, 'target', Number(e.target.value))} />
                    </Field>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {isChange && (
          <Field label="变更原因" required>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：钣金到料晚 3 天，装配顺延" />
          </Field>
        )}
        <div className="row-actions">
          <Btn kind="primary" onClick={save}>{isChange ? '保存变更' : '保存计划'}</Btn>
        </div>
      </div>
      {diffOpen && (
        <Modal
          title="生产步骤与项目总计划不一致"
          okText="同步调整总计划"
          onCancel={() => { setDiffOpen(false); commit(false) }}
          onOk={() => { setDiffOpen(false); commit(true) }}
        >
          <p>以下步骤的计划完成日和项目总计划（首页瀑布流）对不上：</p>
          <Table
            columns={[
              { key: 'name', title: '步骤' },
              { key: 'plan', title: '总计划', render: (r) => r.plan || '—' },
              { key: 'next', title: '本次填写' },
            ]}
            rows={diffs.map((d, i) => ({ ...d, id: i }))}
          />
          <p className="hint">点「同步调整总计划」会把上面的日期写回项目总计划；点「取消」则只保存本计划，首页瀑布流仍按老日期算交期预警。</p>
        </Modal>
      )}
    </Page>
  )
}

export function PlanDetail() {
  const { id } = useParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const ex = useExReport()
  const pp = state.productionPlans.find((p) => p.id === id)
  const punches = state.punches.filter((p) => p.soId === pp?.soId)
  const so = state.salesOrders.find((s) => s.id === pp?.soId)
  const complete = useCompleteFlow({ state, actions, flash })
  const notice = usePlanNotice()
  if (!pp) return <p>不存在</p>
  const steps = pp.robot === false ? pp.steps.filter((s) => s.name !== '机器人') : pp.steps
  const k = ppDocStatus(pp)
  const bom = state.boms.find((b) => b.soId === pp.soId)
  const fgQty = Number(bom?.qty || 1)

  return (
    <Page
      crumb={<>生产管理 / 生产管控 / {id}</>}
      title={so?.projectName || id}
      extra={
        <>
          <Btn onClick={() => nav('/production')}>返回列表</Btn>
          {k === 'draft' && <Btn onClick={() => nav(`/production/${id}/edit`)}>编辑计划</Btn>}
          {k === 'running' && <Btn onClick={() => nav(`/production/${id}/edit?mode=change`)}>变更计划</Btn>}
        </>
      }
    >
      {node}
      {complete.node}
      {notice.node}
      {ex.node}
      <div className="card">
        <div className="detail-grid">
          <div className="k">计划状态</div><div>{ppDocStatusLabel(k)}</div>
          <div className="k">所属项目</div><div>{so?.projectName}（{pp.soId}）</div>
          <div className="k">计划确认</div><div>{pp.confirmedAt ? `已确认 ${pp.confirmedAt}` : '还没确认，确认后只能查看'}</div>
          <div className="k">完工时间</div><div>{pp.doneAt || '未完工'}</div>
          <div className="k">机器人步骤</div><div>{pp.robot === false ? '已跳过' : '有'}</div>
        </div>
        <p>台数以 BOM 为准。项目 {so?.projectName}（{pp.soId}）。打卡按时间倒序。进度落后于当时排期的会标延期；调期之后按新日期算，正常的不标。</p>
        <div className="v-fall" style={{ marginTop: 16 }}>
          {steps.map((s) => (
            <StepBlock key={s.name} step={s} done={pp.done} punches={punches.filter((p) => p.step === s.name)} state={state} />
          ))}
        </div>
        <div className="row-actions" style={{ marginTop: 16 }}>
          {k === 'draft' && (
            <>
              <Btn onClick={() => nav(`/production/${id}/edit`)}>编辑计划</Btn>
              <Btn kind="danger" onClick={() => ask('删除计划草稿', '只有草稿能直接删除，删除后不再出现在列表，并记入操作记录。删除后返回列表。', () => { const res = actions.deletePlanDraft(id); if (res.ok) nav('/production'); return res })}>删除草稿</Btn>
              <Btn kind="primary" onClick={() => ask('确认生产计划', '确认后计划只能查看，要改就得走「变更」。确认前请核对各步骤完成日。', () => {
                const res = actions.confirmPPPlan(id)
                if (res.ok) {
                  notice.open({
                    desc: `已确认「${so?.projectName || pp.soId}」的生产计划，要不要把这次排期通知相关同事？`,
                    employees: state.employees,
                    onSend: (ids) => actions.sendPlanNotice(ids, {
                      scope: '生产计划',
                      soId: pp.soId,
                      title: `生产计划确认 · ${so?.projectName || pp.soId}`,
                      detail: '生产计划已确认，后续按此排期执行。',
                    }),
                  })
                }
                return res
              })}>确认计划</Btn>
            </>
          )}
          {k === 'running' && (
            <>
              <Btn onClick={() => nav(`/production/${id}/edit?mode=change`)}>变更计划</Btn>
              <Btn kind="primary" onClick={() => complete.start(pp)}>确认完工</Btn>
            </>
          )}
          {k === 'done' && <Btn onClick={() => ask('回退确认完成', '须先作废/回退销售出库单。卷装打卡出库不随本次回退。', () => actions.rollbackPP(pp.soId))}>回退确认完工</Btn>}
          <Btn onClick={() => ex.open({ process: '生产', soId: pp.soId, hint: '缺料 / 延期 / 设备故障 / 质量问题。提交后进入异常中心。', onDone: flash })}>提交异常</Btn>
        </div>
      </div>
      {pp.changes?.length > 0 && (
        <div className="card">
          <h3>变更记录</h3>
          <Table
            columns={[
              { key: 'at', title: '时间' },
              { key: 'by', title: '操作人' },
              { key: 'reason', title: '变更原因' },
            ]}
            rows={pp.changes.map((c, i) => ({ ...c, id: i }))}
          />
        </div>
      )}
    </Page>
  )
}

function StepBlock({ step, done, punches, state }) {
  const [open, setOpen] = useState(punches.length > 0)
  const prog = step.progress || 0
  const on = done || prog >= 100
  const warn = !done && prog > 0 && prog < 100
  const rows = [...punches].sort((a, b) => (String(a.at || '') < String(b.at || '') ? 1 : -1))
  return (
    <div className={`v-node ${on ? 'on' : warn ? 'warn' : ''}`}>
      <div className="v-title-row">
        <div className="v-title">{step.name}</div>
        <button className="btn-mini" onClick={() => setOpen((v) => !v)}>{open ? '收起打卡' : '展开打卡'}</button>
      </div>
      <div className="v-st">
        {on ? '已完成' : warn ? `进行中 · ${prog}%` : '未开始'}
        {on && step.doneAt ? ` · ${step.doneAt}` : ''}
        {!on && step.date ? ` · 计划 ${step.date}` : ''}
        {` · 目标 ${step.target}%`}
      </div>
      <div className="progress" style={{ marginTop: 8 }}><i style={{ width: `${prog}%` }} /></div>
      {open && (
        punches.length === 0
          ? <p className="hint">这一步还没有打卡</p>
          : (
            <Table
              columns={[
                { key: 'at', title: '时间' },
                { key: 'by', title: '人' },
                { key: 'progress', title: '本步进度 %' },
                { key: 'st', title: '与计划对照', render: (r) => punchRiskTag(punchRisk(state, r)) },
                { key: 'rollQty', title: '卷材用量' },
                { key: 'photo', title: '拍照', render: (r) => r.photo || '—' },
                { key: 'note', title: '说明' },
              ]}
              rows={rows}
            />
          )
      )}
    </div>
  )
}

/** 生产灯：与平板共用 store 的 prodRiskTone（以步骤计划日 + 目标进度为准），不再用项目计划里程碑日。 */
function prodDelayTone(state, plan) {
  return prodRiskTone(state, plan)
}

function punchRiskTag(risk) {
  // 打卡记录不带状态标签（状态是计划上的事），只做一句对照说明
  if (risk === 'overdue' || risk === 'late') return <span className="cell-mute">当天落后计划</span>
  if (risk === 'maybe') return <span className="cell-mute">当天接近计划线</span>
  return null
}

function stepProgressText(r) {
  const names = r.robot === false ? ['结构', '电路', '装配'] : ['结构', '电路', '机器人', '装配']
  return names.map((n) => {
    const st = r.steps.find((s) => s.name === n)
    return `${n} ${st?.progress || 0}%`
  }).join(' · ')
}
