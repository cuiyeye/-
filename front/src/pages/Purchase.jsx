import { Fragment, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  billStatus,
  delayTone,
  nameOf,
  piCanCancel,
  piDocStatus,
  piDocStatusLabel,
  piNeedShipConfirm,
  poBillType,
  poCanCancel,
  poDocStatus,
  poDocStatusLabel,
  poDue,
  payBillDue,
  payBillOf,
  poLineKinds,
  poMatLabel,
  poMatType,
  poNeedShipConfirm,
  poPendingPIs,
  poSettle,
  poSourceLabel,
  producePolicy,
  produceRemind,
  remainQty,
  reminderOf,
  returnCanCancel,
  returnDocStatus,
  returnDocStatusLabel,
  returnOutCanCancel,
  returnOutDocStatus,
  returnOutDocStatusLabel,
  returnOutAmount,
  returnableQty,
  useStore,
} from '../store'
import { Btn, DocStatus, Field, Filters, FormCard, Tag, matchDelay, Modal, OpsLinks, Page, Pager, ProgressCell, Section, Table, Tabs, slicePage, useDialog } from '../ui'
import { BillTag, useSettleDialog } from '../bill'

/** 列表 tab 归并口径：「已完结」并入「已完成」，避免多一个 tab */
const PO_TAB_STATUS = {
  draft: ['draft'],
  wait: ['wait'],
  partial: ['partial'],
  done: ['done', 'complete'],
  cancelled: ['cancelled'],
}

/** 进度：与单据状态分开；网购无「供应商生产中」，确认后即在途 */
function poTransit(state, po) {
  if (po.closeStatus === 'closed') return '—'
  if (po.confirmStatus !== 'confirmed') return '草稿'
  if (po.completeStatus === 'done') return '已完结'
  if (po.inboundStatus === 'all') return '已到货'
  const sup = state.suppliers.find((s) => s.id === po.supplierId)
  if (sup?.type === '网购' || po.shipped) return '在途'
  return '供应商生产中'
}

function poTransitFilterKey(state, po) {
  const stage = poTransit(state, po)
  if (stage === '已到货') return 'arrived'
  if (stage === '在途') return 'way'
  if (stage === '供应商生产中') return 'producing'
  return ''
}

/** 进度灯：供应商生产走「进入后 N 天开始 + 每 M 天提醒一次 + 人工升级红灯」；
 *  在途走「到货入库」节点天数（对照约定交期）。两者都从提醒策略读，不再写死。 */
function poProgressTone(state, po, isProducing) {
  if (po.inboundStatus === 'all' || po.closeStatus === 'closed' || po.confirmStatus !== 'confirmed' || po.completeStatus === 'done') return ''
  if (isProducing) return produceRemind(state, po)?.tone || ''
  return delayTone(po.confirmEta || po.eta, reminderOf(state, 'transit'))
}

function addressLabel(v) {
  if (!v || v === '本厂') return '本厂'
  return '客户地址'
}

function dayOf(v) {
  return String(v || '').slice(0, 10)
}

export function PoList() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { ask, node } = useDialog()
  const [tab, setTab] = useState(sp.get('tab') || 'all')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [soId, setSoId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [matType, setMatType] = useState('')
  const [delay, setDelay] = useState('')
  const [settle, setSettle] = useState('')
  const [address, setAddress] = useState('')
  const [orderFrom, setOrderFrom] = useState('')
  const [orderTo, setOrderTo] = useState('')
  const [progress, setProgress] = useState('')
  const [poKind, setPoKind] = useState('')
  const buyCfg = reminderOf(state, 'purchase')
  const producingCfg = reminderOf(state, 'producing')

  const counts = useMemo(() => {
    const all = state.purchaseOrders
    return {
      all: all.length,
      draft: all.filter((p) => poDocStatus(p) === 'draft').length,
      wait: all.filter((p) => poDocStatus(p) === 'wait').length,
      partial: all.filter((p) => poDocStatus(p) === 'partial').length,
      done: all.filter((p) => PO_TAB_STATUS.done.includes(poDocStatus(p))).length,
      cancelled: all.filter((p) => poDocStatus(p) === 'cancelled').length,
    }
  }, [state.purchaseOrders])

  const rows = state.purchaseOrders.filter((p) => {
    if (tab !== 'all' && !PO_TAB_STATUS[tab].includes(poDocStatus(p))) return false
    const proj = state.salesOrders.find((s) => s.id === p.soId)?.projectName || ''
    if (q && !p.id.includes(q) && !(p.soId || '').includes(q) && !proj.includes(q)) return false
    if (soId === '__none__' && p.soId) return false
    if (soId && soId !== '__none__' && p.soId !== soId) return false
    if (supplierId && p.supplierId !== supplierId) return false
    if (matType && !poLineKinds(state, p).has(matType)) return false
    if (settle && poSettle(p, state) !== settle) return false
    if (address === '本厂' && addressLabel(p.address) !== '本厂') return false
    if (address === '客户' && addressLabel(p.address) === '本厂') return false
    const od = dayOf(p.confirmedAt)
    if (orderFrom && (!od || od < orderFrom)) return false
    if (orderTo && (!od || od > orderTo)) return false
    if (progress && poTransitFilterKey(state, p) !== progress) return false
    if (poKind === 'part' && !p.part) return false
    if (poKind === 'normal' && p.part) return false
    const isProducing = !p.shipped && state.suppliers.find((s) => s.id === p.supplierId)?.type !== '网购'
    const tone = poProgressTone(state, p, isProducing)
    if (!matchDelay(tone, delay)) return false
    return true
  })

  return (
    <Page crumb={<>采购管理 / 采购订单</>}>
      {node}
      <div className="card">
        <Tabs
          value={tab}
          onChange={(k) => { setTab(k); setPage(1) }}
          items={[
            { key: 'all', label: '全部', count: counts.all },
            { key: 'draft', label: '草稿', count: counts.draft },
            { key: 'wait', label: '待入库', count: counts.wait },
            { key: 'partial', label: '部分入库', count: counts.partial },
            { key: 'done', label: '已完成', count: counts.done },
            { key: 'cancelled', label: '已取消', count: counts.cancelled },
          ]}
        />
        <Filters onQuery={() => setPage(1)} onReset={() => {
          setQ(''); setSoId(''); setSupplierId(''); setMatType(''); setDelay(''); setSettle(''); setAddress(''); setOrderFrom(''); setOrderTo(''); setProgress(''); setPoKind(''); setPage(1)
        }}>
          <Field label="采购单号">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="采购单号" />
          </Field>
          <Field label="采购类型">
            <select value={poKind} onChange={(e) => setPoKind(e.target.value)}>
              <option value="">全部</option>
              <option value="normal">采购订单</option>
              <option value="part">补件采购</option>
            </select>
          </Field>
          <Field label="项目">
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">全部项目</option>
              <option value="__none__">不挂项目</option>
              {state.salesOrders.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
          <Field label="供应商">
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">全部</option>
              {state.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="物料类型">
            <select value={matType} onChange={(e) => setMatType(e.target.value)}>
              <option value="">全部</option>
              <option value="项目料">项目料</option>
              <option value="常备料">常备料</option>
            </select>
          </Field>
          <Field label="进度">
            <select value={progress} onChange={(e) => setProgress(e.target.value)}>
              <option value="">全部</option>
              <option value="producing">供应商生产中</option>
              <option value="way">在途</option>
              <option value="arrived">已到货</option>
            </select>
          </Field>
          <Field label="送达地址">
            <select value={address} onChange={(e) => setAddress(e.target.value)}>
              <option value="">全部</option>
              <option value="本厂">本厂</option>
              <option value="客户">客户地址</option>
            </select>
          </Field>
          <Field label="下单日期起">
            <input type="date" value={orderFrom} onChange={(e) => setOrderFrom(e.target.value)} />
          </Field>
          <Field label="下单日期止">
            <input type="date" value={orderTo} onChange={(e) => setOrderTo(e.target.value)} />
          </Field>
          <Field label="采购交期预警">
            <select value={delay} onChange={(e) => setDelay(e.target.value)}>
              <option value="">全部</option>
              <option value="ok">正常</option>
              <option value="maybe">即将延期</option>
              <option value="overdue">延期</option>
            </select>
          </Field>
          <Field label="结算">
            <select value={settle} onChange={(e) => setSettle(e.target.value)}>
              <option value="">全部</option>
              <option value="unpaid">未结算</option>
              <option value="partial">部分结算</option>
              <option value="all">全部结算</option>
            </select>
          </Field>
        </Filters>
        <div className="list-toolbar">
          <Btn onClick={() => nav('/purchase/part')}>补件采购</Btn>
          <Btn kind="primary" onClick={() => nav('/purchase/po/new')}>新增</Btn>
        </div>
        <Table
          onRow={(r) => nav(`/purchase/po/${r.id}`)}
          columns={[
            { key: 'id', title: '采购订单', link: true },
            {
              key: 'progress',
              title: '进度',
              // 与瀑布流「采购 → 入库」同一套阶段说法：供应商生产中 / 在途 / 已到货，带延期彩标
              render: (r) => {
                const k = poDocStatus(r)
                if (k === 'draft' || k === 'cancelled') return '—'
                const isProducing = !r.shipped && state.suppliers.find((s) => s.id === r.supplierId)?.type !== '网购'
                return <ProgressCell stage={poTransit(state, r)} tone={poProgressTone(state, r, isProducing)} />
              },
            },
            {
              key: 'doc',
              title: '单据状态',
              render: (r) => <PoDocTag po={r} />,
            },
            {
              key: 'proj',
              title: '项目',
              render: (r) => (poMatType(state, r) === '常备料' || !r.soId
                ? '—'
                : (state.salesOrders.find((s) => s.id === r.soId)?.projectName || r.soId)),
            },
            { key: 'mat', title: '物料类型', render: (r) => poMatLabel(state, r) },
            { key: 'sup', title: '供应商', render: (r) => nameOf(state.suppliers, r.supplierId) },
            { key: 'eta', title: '供应商确认交期', render: (r) => r.confirmEta || r.eta || '—' },
            { key: 'orderAt', title: '下单日期', render: (r) => dayOf(r.confirmedAt) || '—' },
            {
              key: 'act',
              title: '操作',
              render: (r) => (
                <OpsLinks
                  items={[
                    { label: '查看', onClick: () => nav(`/purchase/po/${r.id}`) },
                    r.confirmStatus !== 'confirmed' && r.closeStatus !== 'closed' && {
                      label: '删除',
                      onClick: () => ask('删除采购订单草稿', '只有草稿能直接删除，删除后不再出现在列表，并记入操作记录。已确认的请走「取消」。', () => actions.deletePoDraft(r.id)),
                    },
                    r.confirmStatus !== 'confirmed' && r.closeStatus !== 'closed' && {
                      label: '确认下单',
                      onClick: () => ask('确认采购订单', '确认后记为下单日期，进入待入库。网购渠道自动视为已发。', () => actions.confirmPO(r.id)),
                    },
                    poNeedShipConfirm(state, r) && {
                      label: '确认发货',
                      onClick: () => ask('确认供应商已发货', '本单进入在途。', () => actions.markShipped(r.id)),
                    },
                    poCanCancel(state, r) && {
                      label: '取消',
                      onClick: () => ask('取消采购订单', '仅草稿，或已确认但尚无任何入库单时可取消。', () => actions.cancelPO(r.id)),
                    },
                    r.closeStatus === 'closed' && {
                      label: '回退',
                      onClick: () => ask('回退采购订单', '取消只是打了作废标记，单据内容没动过；回退后回到取消前的状态。', () => actions.reopenPO(r.id)),
                    },
                  ]}
                />
              ),
            },
          ]}
          rows={slicePage(rows, page)}
        />
        <Pager total={rows.length} page={page} onChange={setPage} />
      </div>
    </Page>
  )
}

export function PoDetail() {
  const { id } = useParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, node } = useDialog()
  const [note, setNote] = useState('')
  const [payDue, setPayDue] = useState(() => state.purchaseOrders.find((p) => p.id === id)?.payDue || '')
  const [confirmEta, setConfirmEta] = useState(() => state.purchaseOrders.find((p) => p.id === id)?.confirmEta || '')
  const [syncAsk, setSyncAsk] = useState(false)
  const po = state.purchaseOrders.find((p) => p.id === id)
  if (!po) return <p>不存在</p>
  const pis = state.inboundOrders.filter((p) => p.poId === id)
  const mat = poMatType(state, po)
  const doc = poDocStatus(po)
  const buyCfg = reminderOf(state, 'purchase')
  const producingCfg = reminderOf(state, 'producing')
  const supType = state.suppliers.find((s) => s.id === po.supplierId)?.type
  // 供应商侧延期彩标（与列表同一口径）
  const tone = poProgressTone(state, po, !po.shipped && supType !== '网购')
  const orderedQty = po.lines.reduce((s, l) => s + Number(l.qty || 0), 0)
  const gotQty = state.inboundOrders.filter((p) => p.poId === id && p.confirmed).reduce((s, p) => s + (p.lines || []).reduce((a, l) => a + Number(l.qty || 0), 0), 0)
  const leftQty = Math.max(0, orderedQty - gotQty)
  const pendingPIs = poPendingPIs(state, id)

  /** 完结订单：先卡「有没有未入库的入库单」，有就先让回退 */
  function startComplete() {
    if (pendingPIs.length) {
      ask(
        '还不能完结',
        `本单还有 ${pendingPIs.length} 张未入库的入库单：${pendingPIs.map((p) => p.id).join('、')}。请先回退或作废这些入库单，再回来完结。`,
        () => ({ ok: true, message: '已了解，先去处理入库单' }),
      )
      return
    }
    ask(
      '完结订单',
      `本单订购 ${orderedQty}，已入库 ${gotQty}，剩余 ${leftQty} 不再要了。确认后本单完结，剩余部分不再计入在途。`,
      (reason) => actions.completePO(id, reason),
      { label: '完结原因（可不填）', placeholder: '例如：供应商缺料，剩余取消' },
    )
  }

  // 供应商生产阶段的状态（黄灯 / 红灯 / 还没到起始天数），口径统一在 store 的 produceRemind 里
  const produceInfo = po.shipped ? null : produceRemind(state, po)

  return (
    <Page
      crumb={<>采购管理 / 采购订单 / {id}</>}
      title={id}
      extra={
        <>
          <Btn onClick={() => nav('/purchase/po')}>返回列表</Btn>
          {po.confirmStatus !== 'confirmed' && po.closeStatus !== 'closed' && (
            <Btn kind="danger" onClick={() => ask('删除采购订单草稿', '只有草稿能直接删除，删除后不再出现在列表，并记入操作记录。删除后返回列表。', () => { const r = actions.deletePoDraft(id); if (r.ok) nav('/purchase/po'); return r })}>删除草稿</Btn>
          )}
          {po.confirmStatus !== 'confirmed' && po.closeStatus !== 'closed' && (
            <Btn kind="primary" onClick={() => ask('确认采购订单', '确认后记为下单日期。', () => actions.confirmPO(id))}>确认下单</Btn>
          )}
          {po.confirmStatus === 'confirmed' && po.closeStatus !== 'closed' && (
            <>
              <Btn onClick={() => nav(`/purchase/pi/new?po=${id}`)}>创建采购入库单</Btn>
              <Btn onClick={() => nav(`/purchase/return/new?po=${id}`)}>采购退货</Btn>
              {payBillOf(state, id) && (
                <Btn onClick={() => nav(`/purchase/payable/${payBillOf(state, id).id}`)}>打开付款单</Btn>
              )}
            </>
          )}
          {poNeedShipConfirm(state, po) && (
            <Btn kind="primary" onClick={() => ask('确认供应商已发货', '本单进入在途。', () => actions.markShipped(id))}>确认发货</Btn>
          )}
          {po.shipped && po.confirmStatus === 'confirmed' && po.closeStatus !== 'closed' && (
            <Btn onClick={() => ask('回退确认发货', '有已确认入库单时须先回退入库单。', () => actions.rollbackShip(id))}>回退发货</Btn>
          )}
          {po.confirmStatus === 'confirmed' && po.closeStatus !== 'closed' && po.completeStatus !== 'done' && po.inboundStatus !== 'all' && gotQty > 0 && (
            <Btn kind="primary" onClick={startComplete}>完结订单</Btn>
          )}
          {po.completeStatus === 'done' && (
            <Btn onClick={() => ask('回退完结', '剩余未交部分重新计入在途，可继续收货。', () => actions.reopenPOComplete(id))}>回退完结</Btn>
          )}
          {poCanCancel(state, po) && (
            <Btn kind="danger" onClick={() => ask('取消采购订单', '仅草稿，或已确认但尚无任何入库单时可取消。', () => actions.cancelPO(id))}>取消</Btn>
          )}
          {po.closeStatus === 'closed' && (
            <Btn onClick={() => ask('回退采购订单', '取消只是打了作废标记，单据内容没动过；回退后回到取消前的状态。', () => actions.reopenPO(id))}>回退</Btn>
          )}
          <Btn kind="danger" onClick={() => ask('回退采购订单', '没有任何入库单、退货单才允许。有则必须先回退下游。', () => actions.rollbackPO(id))}>回退采购订单</Btn>
        </>
      }
    >
      {node}
      <div className="card">
        <div className="detail-grid">
          <div className="k">单据状态</div><div><PoDocTag po={po} /></div>
          <div className="k">进度</div>
          <div>{doc === 'draft' || doc === 'cancelled' ? '—' : poTransit(state, po)}{tone === 'overdue' ? ' · 延期' : tone === 'maybe' ? ' · 即将延期' : ''}</div>
          <div className="k">物料类型</div><div>{poMatLabel(state, po)}</div>
          <div className="k">项目</div>
          <div>{mat === '常备料' || !po.soId ? '—' : (state.salesOrders.find((s) => s.id === po.soId)?.projectName || po.soId)}</div>
          <div className="k">供应商</div><div>{nameOf(state.suppliers, po.supplierId)}（{state.suppliers.find((s) => s.id === po.supplierId)?.type || '—'}）</div>
          <div className="k">送达地址</div><div>{addressLabel(po.address) === '本厂' ? '本厂' : (po.address || '客户地址')}</div>
          <div className="k">供应商确认交期</div><div>{po.confirmEta || po.eta || '未回复'}</div>
          <div className="k">预计付款日</div><div>{po.payDue || '未填'}</div>
          <div className="k">下单日期</div><div>{dayOf(po.confirmedAt) || '未确认'}</div>
          <div className="k">入库数量</div>
          <div>已入 <b>{gotQty}</b> / 订购 {orderedQty}{leftQty > 0 ? `（还差 ${leftQty}）` : '（已到齐）'}</div>
          <div className="k">单据类型</div>
          <div>{poBillType(po)}</div>
          <div className="k">来源</div>
          <div>{poSourceLabel(po)}</div>
        </div>
        <Table
          columns={[
            { key: 'productId', title: '物料', render: (r) => nameOf(state.products, r.productId) },
            { key: 'type', title: '类型', render: (r) => state.products.find((p) => p.id === r.productId)?.type || '—' },
            { key: 'qty', title: '数量' },
            { key: 'price', title: '单价' },
          ]}
          rows={po.lines}
        />
      </div>
      {po.closeStatus !== 'closed' && po.inboundStatus === 'none' && (
        <div className="card">
          <h3>交期与付款</h3>
          <p className="hint">
            「供应商确认交期」是本单唯一的交期（在途提醒按它算）；「预计付款日」用于付款提醒。下单后、入库前可改，改动会写操作记录。
          </p>
          <div className="form-stack">
            <Field label="供应商确认交期">
              <input type="date" value={confirmEta} onChange={(e) => setConfirmEta(e.target.value)} />
            </Field>
            <Field label="预计付款日">
              <input type="date" value={payDue} onChange={(e) => setPayDue(e.target.value)} />
            </Field>
            <div className="row-actions">
              <Btn
                kind="primary"
                onClick={() => ask('保存交期 / 预计付款日', '保存后用于在途与付款提醒。', () => {
                  const changed = dayOf(confirmEta) !== dayOf(po.confirmEta || po.eta || '')
                  const r = actions.savePoFields(id, { confirmEta, payDue })
                  if (r.ok && changed && po.soId) setSyncAsk(true)
                  return r
                })}
              >
                保存
              </Btn>
            </div>
          </div>
        </div>
      )}
      {syncAsk && (
        <Modal
          title="同步到项目计划？"
          okText="同步"
          onCancel={() => setSyncAsk(false)}
          onOk={() => { setSyncAsk(false); actions.syncPoEtaToPlan(id) }}
        >
          <p>供应商确认交期已改为 <b>{dayOf(confirmEta) || '空'}</b>。要把这个日期同步到本项目项目计划的「采购」节点吗？</p>
        </Modal>
      )}
      {po.closeStatus !== 'closed' && po.confirmStatus === 'confirmed' && !po.shipped && (
        <div className="card">
          <h3>供应商跟进</h3>
          <p className="hint">
            供应商生产阶段按「提醒策略」里的「{producePolicy(state).label}」走：到配置的起始天数开始亮<b>黄灯</b>，之后每 {producePolicy(state).every} 天提醒一次。
            供应商说赶不及，就点<b>「一键升级」</b>——改成每天提醒并写进异常中心，直到你在采购订单列表点「确认发货」为止，点了就不再提醒。
            平时线下沟通的结果，记在下面的跟进记录里。
          </p>
          <div className="row-actions" style={{ marginBottom: 10 }}>
            {supType === '网购' ? (
              <span className="cell-mute">网购渠道：确认采购后即进入在途，没有「供应商生产中」这一段。</span>
            ) : produceInfo ? (
              <>
                <DocStatus value={produceInfo.red ? '红灯 · 每天提醒' : `黄灯 · 每 ${produceInfo.cadence} 天提醒一次`} tone={produceInfo.red ? 'warn' : 'run'} />
                <span className="cell-mute">{produceInfo.text}</span>
              </>
            ) : (
              <span className="cell-mute">
                还没到提醒策略里配的起始天数（确认后第 {producePolicy(state).startAfter} 天开始提醒）；期间也可以先记跟进。
              </span>
            )}
          </div>
          {mat === '常备料' ? (
            <p className="hint">常备料是库存补货单，只做上面这条状态跟进，不需要逐条写跟进备注。</p>
          ) : (
            <div className="form-stack">
              <Field label="跟进记录">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：已电话催，对方回复周五发货" />
              </Field>
              <Btn kind="primary" onClick={() => ask('添加跟进记录', '只记入本单跟进，不进异常中心。要拉人盯请用「一键升级」。', () => {
                const r = actions.addPoNote(id, note)
                if (r.ok) setNote('')
                return r
              })}>添加跟进记录</Btn>
            </div>
          )}
          <div className="row-actions" style={{ marginBottom: 10 }}>
            {!po.produceRed && (
              <Btn
                disabled={!produceInfo}
                onClick={() => ask('一键升级', '升级为红灯：改成每天提醒，并写进异常中心。直到你在列表点「确认发货」才停止提醒。', () => actions.escalateProduce(id))}
              >一键升级</Btn>
            )}
            {po.produceRed && <span className="cell-mute">已升级红灯，每天提醒中 —— 在列表点「确认发货」后停止。</span>}
          </div>
          <Table
            columns={[
              { key: 'at', title: '时间' },
              { key: 'by', title: '操作人' },
              { key: 'text', title: '内容' },
            ]}
            rows={(po.notes || []).map((n, i) => ({ ...n, id: i }))}
          />
        </div>
      )}
      <div className="card">
        <h3>关联入库单</h3>
        <Table
          columns={[
            { key: 'id', title: '入库单' },
            { key: 'st', title: '状态', render: (r) => (r.confirmed ? '已确认' : '草稿') },
            { key: 'date', title: '入库日期', render: (r) => r.confirmedAt || r.createdAt || '—' },
            { key: 'remark', title: '备注' },
          ]}
          rows={pis}
        />
      </div>
    </Page>
  )
}

export function PoForm() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, node } = useDialog()
  const openSos = state.salesOrders.filter((s) => s.confirmStatus === 'confirmed' && s.closeStatus === 'open')
  const [soId, setSoId] = useState('')
  const [sugLines, setSugLines] = useState([])
  const [address, setAddress] = useState('本厂')
  const [customAddress, setCustomAddress] = useState('')
  const [eta, setEta] = useState('')
  const bom = state.boms.find((b) => b.soId === soId && b.confirmed)
  const sug = state.suggests.find((s) => s.soId === soId)

  function pickSo(id) {
    setSoId(id)
    if (!id) {
      setSugLines([])
      return
    }
    const b = state.boms.find((x) => x.soId === id && x.confirmed)
    const s = state.suggests.find((x) => x.soId === id)
    if (s?.lines?.length) setSugLines(s.lines.map((l) => ({ ...l })))
    else if (b) {
      const lines = (b.lines || []).map((l) => {
        const p = state.products.find((x) => x.id === l.productId)
        const need = Number(l.per || 0) * Number(b.qty || 0)
        const stock = Number(p?.stock || 0)
        const gap = Math.max(0, need - stock)
        return {
          productId: l.productId,
          name: p?.name || l.name || '',
          type: p?.type || l.type || '项目料',
          supplierId: l.supplierId,
          need,
          stock,
          qty: gap,
          buy: gap > 0,
        }
      })
      setSugLines(lines)
    } else setSugLines([])
  }

  function setSug(i, k, v) {
    setSugLines((list) => list.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)))
  }

  return (
    <Page crumb={<>采购管理 / 采购订单 / 新增</>}>
      {node}
      <FormCard
        title="新增采购订单"
        extra={
          <>
            <Btn kind="ghost" onClick={() => nav('/purchase/po')}>← 返回列表</Btn>
            <Btn
              kind="primary"
              disabled={!soId || !bom || !!sug?.confirmed || !sugLines.some((l) => l.buy !== false && Number(l.qty) > 0)}
              onClick={() => ask('按建议生成采购订单', `按勾选行、按供应商生成采购订单。送达地址：${address === '本厂' ? '本厂' : (customAddress || '客户地址')}；供应商确认交期：${eta || '按项目计划采购节点 / 默认 7 天'}。常备料行不挂项目；项目料挂本项目。`, () => {
                const r = actions.confirmSuggest(soId, sugLines, { address, customAddress, eta })
                if (r.ok) nav('/purchase/po')
                return r
              })}
            >
              按建议下单
            </Btn>
          </>
        }
      >
        <Section title="关联项目" hint="选项目后带出已确认的泵清单（BOM）与采购建议，可改数量后再下单。补件请走「补件采购」。">
          <div className="form-stack">
            <Field label="项目" required>
              <select value={soId} onChange={(e) => pickSo(e.target.value)}>
                <option value="">请选择项目</option>
                {openSos.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
              </select>
            </Field>
            <Field label="送达地址">
              <select value={address} onChange={(e) => setAddress(e.target.value)}>
                <option value="本厂">本厂</option>
                <option value="客户">客户地址</option>
              </select>
            </Field>
            {address === '客户' && (
              <Field label="客户详细地址">
                <input value={customAddress} onChange={(e) => setCustomAddress(e.target.value)} />
              </Field>
            )}
            <Field label="供应商确认交期">
              <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
            </Field>
          </div>
        </Section>
        {soId && !bom && (
          <Section title="泵清单">
            <p className="hint">该项目还没有已确认的 BOM。请先到设计管理确认泵清单，再回来下单。</p>
            <Btn onClick={() => nav(`/design/bom/${soId}`)}>去编 / 确认 BOM</Btn>
          </Section>
        )}
        {soId && bom && (
          <Section title="泵清单" hint={`已确认 BOM · 台数 ${bom.qty || 1}`}>
            <Table
              columns={[
                { key: 'name', title: '物料', render: (r) => r.name || nameOf(state.products, r.productId) },
                { key: 'type', title: '类型', render: (r) => r.type || state.products.find((p) => p.id === r.productId)?.type || '—' },
                { key: 'per', title: '单台用量' },
                { key: 'sup', title: '供应商', render: (r) => nameOf(state.suppliers, r.supplierId) },
              ]}
              rows={(bom.lines || []).map((l, i) => ({ ...l, id: i }))}
            />
          </Section>
        )}
        {soId && bom && (
          <Section title="采购建议" hint="可调整是否下单、数量与供应商。常备料够用的默认不勾选。按供应商合成采购订单；常备料不挂项目。">
            {sug?.confirmed && <p className="hint">本项目已按建议下过单。若要再采，请走补件采购或回退原采购订单。</p>}
            <div className="excel-wrap">
              <table className="excel">
                <thead>
                  <tr>
                    <th>下单</th>
                    <th>物料</th>
                    <th>物料类型</th>
                    <th>总需求</th>
                    <th>可用</th>
                    <th>建议采购数量</th>
                    <th>供应商</th>
                  </tr>
                </thead>
                <tbody>
                  {sugLines.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <input type="checkbox" disabled={!!sug?.confirmed} checked={r.buy !== false} onChange={(e) => setSug(i, 'buy', e.target.checked)} />
                      </td>
                      <td>{r.name || nameOf(state.products, r.productId)}</td>
                      <td>{r.type}</td>
                      <td>{r.need}</td>
                      <td>{r.stock}</td>
                      <td>
                        <input type="number" disabled={!!sug?.confirmed} value={r.qty} onChange={(e) => setSug(i, 'qty', Number(e.target.value))} />
                      </td>
                      <td>
                        <select disabled={!!sug?.confirmed} value={r.supplierId || ''} onChange={(e) => setSug(i, 'supplierId', e.target.value)}>
                          {state.suppliers.filter((s) => s.status !== 'off').map((s) => (
                            <option key={s.id} value={s.id}>{s.name}（{s.type}）</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </FormCard>
    </Page>
  )
}

export function PiList() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { ask, node } = useDialog()
  const [tab, setTab] = useState(sp.get('tab') || 'all')
  const [q, setQ] = useState('')
  const [poId, setPoId] = useState('')
  const [soId, setSoId] = useState('')
  const [bill, setBill] = useState('')
  const [page, setPage] = useState(1)

  const counts = useMemo(() => {
    const all = state.inboundOrders
    return {
      all: all.length,
      wait: all.filter((r) => piDocStatus(r) === 'wait').length,
      way: all.filter((r) => piDocStatus(r) === 'way').length,
      done: all.filter((r) => piDocStatus(r) === 'done').length,
      cancelled: all.filter((r) => piDocStatus(r) === 'cancelled').length,
    }
  }, [state.inboundOrders])

  const rows = state.inboundOrders.filter((r) => {
    if (tab !== 'all' && piDocStatus(r) !== tab) return false
    const po = state.purchaseOrders.find((p) => p.id === r.poId)
    const proj = state.salesOrders.find((s) => s.id === po?.soId)?.projectName || ''
    if (q && !r.id.includes(q) && !(r.poId || '').includes(q) && !(r.remark || '').includes(q) && !proj.includes(q)) return false
    if (poId && r.poId !== poId) return false
    if (soId === '__none__' && po?.soId) return false
    if (soId && soId !== '__none__' && po?.soId !== soId) return false
    if (bill && poBillType(po || {}) !== bill) return false
    return true
  })
  return (
    <Page crumb={<>采购管理 / 采购入库单</>}>
      {node}
      <div className="card">
        <Tabs
          value={tab}
          onChange={(k) => { setTab(k); setPage(1) }}
          items={[
            { key: 'all', label: '全部', count: counts.all },
            { key: 'wait', label: '待发货', count: counts.wait },
            { key: 'way', label: '在途', count: counts.way },
            { key: 'done', label: '已入库', count: counts.done },
            { key: 'cancelled', label: '已取消', count: counts.cancelled },
          ]}
        />
        <Filters onQuery={() => setPage(1)} onReset={() => { setQ(''); setPoId(''); setSoId(''); setBill(''); setPage(1) }}>
          <Field label="入库单号"><input value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="项目">
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">全部项目</option>
              <option value="__none__">不挂项目</option>
              {state.salesOrders.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
          <Field label="采购订单">
            <select value={poId} onChange={(e) => setPoId(e.target.value)}>
              <option value="">全部</option>
              {state.purchaseOrders.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
            </select>
          </Field>
          <Field label="单据类型">
            <select value={bill} onChange={(e) => setBill(e.target.value)}>
              <option value="">全部</option>
              <option>采购订单</option>
              <option>补件采购</option>
            </select>
          </Field>
        </Filters>
        <div className="list-toolbar">
          <Btn kind="primary" onClick={() => nav('/purchase/pi/new')}>新增</Btn>
        </div>
        <Table
          onRow={(r) => nav(`/purchase/pi/${r.id}`)}
          columns={[
            { key: 'id', title: '入库单', link: true },
            { key: 'st', title: '单据状态', render: (r) => <DocStatus value={piDocStatusLabel(piDocStatus(r))} /> },
            { key: 'poId', title: '采购订单' },
            { key: 'proj', title: '项目', render: (r) => {
              const po = state.purchaseOrders.find((p) => p.id === r.poId)
              return po?.soId ? (state.salesOrders.find((s) => s.id === po.soId)?.projectName || po.soId) : '不挂项目'
            } },
            { key: 'bill', title: '单据类型', render: (r) => poBillType(state.purchaseOrders.find((p) => p.id === r.poId) || {}) },
            { key: 'way', title: '渠道', render: (r) => {
              const po = state.purchaseOrders.find((p) => p.id === r.poId)
              const sup = state.suppliers.find((s) => s.id === po?.supplierId)
              return sup?.type === '网购' ? '网购（下单即在途）' : '供应商生产'
            } },
            { key: 'shipAt', title: '发货时间', render: (r) => r.shippedAt || '—' },
            { key: 'date', title: '入库日期', render: (r) => r.confirmedAt || '—' },
            { key: 'remark', title: '备注' },
            {
              key: 'act',
              title: '操作',
              render: (r) => (
                <OpsLinks
                  items={[
                    { label: '查看', onClick: () => nav(`/purchase/pi/${r.id}`) },
                    piNeedShipConfirm(state, r) && { label: '确认发货', onClick: () => ask('确认发货', '供应商生产完并发出后点这里，本单进入采购在途。网购渠道不需要，建单即视为在途。', () => actions.markPIShip(r.id)) },
                    !r.confirmed && r.shipped && r.closeStatus !== 'closed' && { label: '回退发货', onClick: () => ask('回退发货', '回到待发货。已入库的须先回退入库确认。', () => actions.rollbackPIShip(r.id)) },
                    !r.confirmed && r.closeStatus !== 'closed' && { label: '确认入库', onClick: () => ask('确认入库', '回写采购订单入库状态，按行形成应付。', () => actions.confirmPI(r.id)) },
                    r.confirmed && { label: '回退入库', onClick: () => ask('回退入库确认', '回到在途。有退货/付款/生产完成占用时须先回退下游。', () => actions.rollbackPI(r.id)) },
                    piCanCancel(r) && { label: '取消', onClick: () => ask('取消入库单', '没入库就能取消（待发货、在途都可以）。取消后可在「已取消」里回退。', () => actions.cancelPI(r.id)) },
                    r.closeStatus === 'closed' && { label: '回退', onClick: () => ask('回退入库单', '取消只是打了作废标记，单据内容没动过；回退后回到取消前的状态。', () => actions.reopenPI(r.id)) },
                    !r.confirmed && !r.shipped && r.closeStatus !== 'closed' && { label: '删除', onClick: () => ask('删除', '仅待发货可删。', () => actions.deletePI(r.id)) },
                  ]}
                />
              ),
            },
          ]}
          rows={slicePage(rows, page)}
        />
        <Pager total={rows.length} page={page} onChange={setPage} />
      </div>
    </Page>
  )
}

export function PiForm() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { ask, node } = useDialog()
  const openPos = state.purchaseOrders.filter((p) => p.confirmStatus === 'confirmed' && p.closeStatus !== 'closed' && p.inboundStatus !== 'all')
  const initialId = openPos.find((p) => p.id === sp.get('po'))?.id || openPos[0]?.id || ''
  const [poId, setPoId] = useState(initialId)
  const po = state.purchaseOrders.find((p) => p.id === poId)
  const remainLines = (p) => (p?.lines || []).map((l) => ({ productId: l.productId, qty: remainQty(p, l.productId) })).filter((l) => l.qty > 0)
  const [lines, setLines] = useState(() => remainLines(po))
  const [remark, setRemark] = useState('')

  return (
    <Page crumb={<>采购管理 / 采购入库单 / 新增</>} title="新增采购入库单" extra={<Btn onClick={() => nav('/purchase/pi')}>返回列表</Btn>}>
      {node}
      <div className="card">
        <p className="hint">只列出尚未全部入库的采购订单。本批数量默认=剩余可入库量，不能超过剩余。</p>
        {openPos.length === 0 && <p className="hint">没有可入库的采购订单。</p>}
        {openPos.length > 0 && (
          <>
            <Field label="采购订单" required>
              <select value={poId} onChange={(e) => {
                setPoId(e.target.value)
                const p = state.purchaseOrders.find((x) => x.id === e.target.value)
                setLines(remainLines(p))
              }}>
                {openPos.map((p) => (
                  <option key={p.id} value={p.id}>{p.id} {nameOf(state.suppliers, p.supplierId)} · 剩余 {p.lines.map((l) => remainQty(p, l.productId)).join('/')}</option>
                ))}
              </select>
            </Field>
            <Table
              columns={[
                { key: 'productId', title: '物料', render: (r) => nameOf(state.products, r.productId) },
                { key: 'left', title: '剩余可入', render: (r) => remainQty(po, r.productId) },
                {
                  key: 'qty',
                  title: '本批数量',
                  render: (r) => (
                    <input type="number" max={remainQty(po, r.productId)} value={r.qty} onChange={(e) => {
                      const n = [...lines]
                      n[lines.indexOf(r)].qty = Number(e.target.value)
                      setLines(n)
                    }} />
                  ),
                },
              ]}
              rows={lines.map((l, i) => ({ ...l, id: i }))}
            />
            <Field label="备注"><input value={remark} onChange={(e) => setRemark(e.target.value)} /></Field>
            <div className="row-actions" style={{ marginTop: 12 }}>
              <Btn onClick={() => ask('保存草稿', '保存为草稿，不进可用、不形成应付。之后可在列表或详情里确认。', () => {
                const r = actions.createPI(poId, lines, remark)
                if (r.ok) nav('/purchase/pi')
                return r
              })}>保存</Btn>
              <Btn kind="primary" onClick={() => ask('确认入库', '保存并确认：回写采购订单入库状态，本厂地址进可用并形成应付。', () => {
                const r = actions.createPI(poId, lines, remark)
                if (!r.ok) return r
                const c = actions.confirmPI(r.id)
                if (c.ok) nav('/purchase/pi')
                return c
              })}>确认</Btn>
            </div>
          </>
        )}
      </div>
    </Page>
  )
}

export function PiDetail() {
  const { id } = useParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const [recvOpen, setRecvOpen] = useState(false)
  const [recv, setRecv] = useState({})
  const pi = state.inboundOrders.find((p) => p.id === id)
  if (!pi) return <p>入库单不存在</p>
  const po = state.purchaseOrders.find((p) => p.id === pi.poId)
  const declared = pi.lines || []
  const recvQty = (l) => {
    const v = recv[l.productId]
    return v == null ? Number(l.qty) : Number(v) || 0
  }
  const hasShort = declared.some((l) => recvQty(l) < Number(l.qty))
  const shortTotal = declared.reduce((s, l) => s + Math.max(0, Number(l.qty) - recvQty(l)), 0)

  function startRecv() {
    const init = {}
    declared.forEach((l) => { init[l.productId] = Number(l.qty) })
    setRecv(init)
    setRecvOpen(true)
  }

  function doRecv() {
    const lines = declared.map((l) => ({ productId: l.productId, qty: recvQty(l) }))
    const r = actions.confirmPI(id, lines)
    setRecvOpen(false)
    flash(r)
  }

  return (
    <Page crumb={<>采购管理 / 采购入库单 / {id}</>} title={id} extra={<Btn onClick={() => nav('/purchase/pi')}>返回列表</Btn>}>
      {node}
      {recvOpen && (
        <Modal title="确认入库 · 填实收数量" onCancel={() => setRecvOpen(false)} onOk={doRecv} okText="确认入库">
          <p className="hint">默认按单据数量。实际到货少了就改成实收数量，差额会自动拆成一张新的待入库单，挂回同一张采购订单。</p>
          <Table
            columns={[
              { key: 'productId', title: '物料', render: (r) => nameOf(state.products, r.productId) },
              { key: 'doc', title: '单据数量', render: (r) => r.qty },
              {
                key: 'recv',
                title: '实收数量',
                render: (r) => (
                  <input
                    type="number"
                    min="0"
                    style={{ width: 90 }}
                    value={recv[r.productId] ?? r.qty}
                    onChange={(e) => setRecv((v) => ({ ...v, [r.productId]: e.target.value === '' ? 0 : Number(e.target.value) }))}
                  />
                ),
              },
            ]}
            rows={declared.map((l, i) => ({ ...l, id: i }))}
          />
          {hasShort && <p className="hint">差额合计 <b>{shortTotal}</b>，确认后会生成一张新的待入库单。</p>}
        </Modal>
      )}
      <div className="card">
        <div className="detail-grid">
          <div className="k">采购订单</div><div>{pi.poId}</div>
          <div className="k">供应商</div><div>{nameOf(state.suppliers, po?.supplierId)}（{state.suppliers.find((s) => s.id === po?.supplierId)?.type || '—'}）</div>
          <div className="k">单据状态</div><div>{piDocStatusLabel(piDocStatus(pi))}</div>
          <div className="k">发货时间</div><div>{pi.shippedAt || (pi.shipped ? '建单即在途' : '未发货')}</div>
          <div className="k">入库日期</div><div>{pi.confirmedAt || '未入库'}</div>
          <div className="k">开单时间</div><div>{pi.createdAt || '—'}</div>
          <div className="k">备注</div><div>{pi.remark || '—'}</div>
        </div>
        <Table
          columns={[
            { key: 'productId', title: '物料', render: (r) => nameOf(state.products, r.productId) },
            { key: 'qty', title: '数量' },
          ]}
          rows={(pi.lines || []).map((l, i) => ({ ...l, id: i }))}
        />
        <div className="row-actions" style={{ marginTop: 12 }}>
          {piNeedShipConfirm(state, pi) && <Btn kind="primary" onClick={() => ask('确认发货', '供应商生产完并发出后点这里，本单进入采购在途。', () => actions.markPIShip(id))}>确认发货</Btn>}
          {!pi.confirmed && pi.shipped && <Btn onClick={() => ask('回退发货', '回到待发货。已入库须先回退入库确认。', () => actions.rollbackPIShip(id))}>回退发货</Btn>}
          {!pi.confirmed && pi.shipped && <Btn kind="primary" onClick={startRecv}>确认入库</Btn>}
          {pi.confirmed && <Btn onClick={() => ask('回退入库确认', '回到在途。有已确认退货/付款/生产完成占用时须先回退下游。补件入库不因生产完成拦截。', () => actions.rollbackPI(id))}>回退入库</Btn>}
          {piCanCancel(pi) && <Btn kind="danger" onClick={() => ask('取消入库单', '没入库就能取消。', () => actions.cancelPI(id))}>取消</Btn>}
          {pi.closeStatus === 'closed' && <Btn onClick={() => ask('回退入库单', '取消只是打了作废标记，单据内容没动过；回退后回到取消前的状态。', () => actions.reopenPI(id))}>回退</Btn>}
          {!pi.confirmed && !pi.shipped && <Btn kind="danger" onClick={() => ask('删除', '仅待发货可删。', () => { const r = actions.deletePI(id); if (r.ok) nav('/purchase/pi'); return r })}>删除</Btn>}
          {po && <Btn onClick={() => nav(`/purchase/po/${po.id}`)}>看采购订单</Btn>}
        </div>
      </div>
    </Page>
  )
}

/** 备注框：失焦才保存，避免每敲一个字都写状态 */
function RemarkInput({ value, onSave, placeholder }) {
  const [v, setV] = useState(value || '')
  return (
    <input
      value={v}
      placeholder={placeholder || '备注'}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== (value || '')) onSave(v) }}
    />
  )
}

export function Payable() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { flash, node } = useDialog()
  const sd = useSettleDialog()
  const [q, setQ] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [soId, setSoId] = useState(sp.get('soId') || '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tab, setTab] = useState('all')
  const [page, setPage] = useState(1)

  // 每张付款单 = 一个采购订单；金额全部来自付款单（应付 = 实际入库 + 调整）
  const all = state.payBills
    .map((b) => {
      const po = state.purchaseOrders.find((p) => p.id === b.poId)
      const d = payBillDue(b, state)
      return { b, po, d, k: billStatus(d) }
    })
    .sort((x, y) => String(y.b.id).localeCompare(String(x.b.id)))
  const cnt = (fn) => all.filter(fn).length
  const TABS = [
    { key: 'all', label: '全部', count: all.length },
    { key: 'open', label: '待付款', count: cnt((x) => x.k === 'open') },
    { key: 'part', label: '部分付款', count: cnt((x) => x.k === 'part') },
    { key: 'done', label: '已付清', count: cnt((x) => x.k === 'all') },
    { key: 'none', label: '无应付', count: cnt((x) => x.k === 'none') },
  ]
  const rows = all.filter(({ b, po, k }) => {
    if (tab !== 'all' && k !== (tab === 'done' ? 'all' : tab)) return false
    if (q && !b.id.includes(q) && !(b.poId || '').includes(q)) return false
    if (supplierId && b.supplierId !== supplierId) return false
    if (soId === '__none__') {
      if (po?.soId) return false
    } else if (soId && po?.soId !== soId) return false
    if (from && b.date < from) return false
    if (to && b.date > to) return false
    return true
  })
  const sum = rows.reduce((a, { d }) => {
    a.total += d.total
    a.paid += d.paid
    a.unpaid += d.unpaid
    return a
  }, { total: 0, paid: 0, unpaid: 0 })

  /** 付款：弹出登记窗，可改本次金额、也可以调整应付（+涨价 / −抹零） */
  function payNow(b, d, po) {
    sd.open({
      kind: 'pay',
      title: `付款 · ${b.id}`,
      summary: `付款单 ${b.id}（采购订单 ${b.poId}，供应商 ${nameOf(state.suppliers, b.supplierId)}）`,
      total: d.total,
      paid: d.paid,
      left: d.unpaid,
      submit: (v) => {
        const r = actions.payBillSettle(b.id, v)
        flash(r)
        return r
      },
    })
  }

  return (
    <Page crumb={<>采购管理 / 付款单</>}>
      {node}
      {sd.node}
      <div className="card">
        <Tabs value={tab} onChange={(k) => { setTab(k); setPage(1) }} items={TABS} />
        <Filters onQuery={() => setPage(1)} onReset={() => { setQ(''); setSupplierId(''); setSoId(''); setFrom(''); setTo(''); setPage(1) }}>
          <Field label="付款单号 / 采购订单"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="PAY- / PO-" /></Field>
          <Field label="供应商">
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">全部供应商</option>
              {state.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="项目">
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">全部项目</option>
              <option value="__none__">不挂项目（常备料）</option>
              {state.salesOrders.filter((s) => s.confirmStatus === 'confirmed').map((s) => (
                <option key={s.id} value={s.id}>{s.projectName}</option>
              ))}
            </select>
          </Field>
          <Field label="业务日期从"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="业务日期到"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </Filters>
        <Table
          columns={[
            { key: 'id', title: '付款单号', link: true, render: (r) => r.b.id },
            { key: 'st', title: '单据状态', render: (r) => <BillTag due={r.d} kind="pay" /> },
            { key: 'date', title: '业务日期', render: (r) => r.b.date || '—' },
            { key: 'sup', title: '供应商', render: (r) => nameOf(state.suppliers, r.b.supplierId) },
            { key: 'po', title: '采购订单', render: (r) => r.b.poId },
            { key: 'proj', title: '项目', render: (r) => (r.po?.soId ? (state.salesOrders.find((s) => s.id === r.po.soId)?.projectName || r.po.soId) : '不挂项目') },
            { key: 'base', title: '系统应付', render: (r) => `¥ ${Math.round(r.d.base).toLocaleString()}` },
            { key: 'adj', title: '应付调整', render: (r) => (r.d.adjust ? `${r.d.adjust > 0 ? '+' : '−'}¥ ${Math.abs(Math.round(r.d.adjust)).toLocaleString()}` : '—') },
            { key: 'total', title: '应付合计', render: (r) => <b>¥ {Math.round(r.d.total).toLocaleString()}</b> },
            { key: 'paid', title: '已付', render: (r) => `¥ ${Math.round(r.d.paid).toLocaleString()}` },
            { key: 'left', title: '未付', render: (r) => `¥ ${Math.round(r.d.unpaid).toLocaleString()}` },
            {
              key: 'act',
              title: '操作',
              render: (r) => (
                <OpsLinks
                  items={[
                    { label: '查看', onClick: () => nav(`/purchase/payable/${r.b.id}`) },
                    r.d.unpaid > 0 && { label: '付款', onClick: () => payNow(r.b, r.d, r.po) },
                  ]}
                />
              ),
            },
          ]}
          rows={slicePage(rows, page)}
          onRow={(r) => nav(`/purchase/payable/${r.b.id}`)}
        />
        <Pager total={rows.length} page={page} onChange={setPage} />
        <p>
          当前筛选：应付合计 ¥ {Math.round(sum.total).toLocaleString()}
          　已付 ¥ {Math.round(sum.paid).toLocaleString()}
          　未付 <b>¥ {Math.round(sum.unpaid).toLocaleString()}</b>
        </p>
        <p className="hint">
          付款单**由系统按采购订单自动生成**（每个采购订单一张，编号形如 PAY-2026-001），不用手工建。
          应付 = 该采购订单「<b>实际入库数量 × 订单单价</b>」+ 应付调整；付款只能在付款单上登记，可一次也可多次。
        </p>
      </div>
    </Page>
  )
}

/** 付款单详情（金蝶式单据页：单据头 + 应付构成 + 付款明细） */
export function PayBillDetail() {
  const { state, actions } = useStore()
  const { id } = useParams()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const sd = useSettleDialog()
  const bill = state.payBills.find((b) => b.id === id)
  if (!bill) {
    return (
      <Page crumb={<>采购管理 / 付款单</>}>
        <div className="card">付款单 {id} 不存在。<Btn onClick={() => nav('/purchase/payable')}>返回列表</Btn></div>
      </Page>
    )
  }
  const po = state.purchaseOrders.find((p) => p.id === bill.poId)
  const d = payBillDue(bill, state)
  const projects = po?.soId ? (state.salesOrders.find((s) => s.id === po.soId)?.projectName || po.soId) : '不挂项目'
  const receivedLines = (po?.lines || []).map((l) => {
    const qty = (state.inboundOrders || [])
      .filter((pi) => pi.poId === po.id && pi.confirmed)
      .reduce((s, pi) => s + (pi.lines || []).filter((x) => x.productId === l.productId).reduce((a, x) => a + Number(x.qty || 0), 0), 0)
    return { ...l, recvQty: qty, amount: qty * Number(l.price || 0) }
  })

  function payNow() {
    sd.open({
      kind: 'pay',
      title: `付款 · ${bill.id}`,
      summary: `付款单 ${bill.id}（采购订单 ${bill.poId}，供应商 ${nameOf(state.suppliers, bill.supplierId)}）`,
      total: d.total,
      paid: d.paid,
      left: d.unpaid,
      submit: (v) => {
        const r = actions.payBillSettle(bill.id, v)
        flash(r)
        return r
      },
    })
  }

  return (
    <Page
      crumb={<>采购管理 / 付款单 / {bill.id}</>}
      title={bill.id}
      extra={(
        <>
          <BillTag due={d} kind="pay" />
          <Btn onClick={() => nav('/purchase/payable')}>返回列表</Btn>
          <Btn onClick={() => nav(`/purchase/po/${bill.poId}`)}>看采购订单</Btn>
          {d.unpaid > 0 && <Btn kind="primary" onClick={payNow}>付款</Btn>}
        </>
      )}
    >
      {node}
      {sd.node}
      <div className="card">
        <div className="detail-grid">
          <div className="k">付款单号</div><div>{bill.id}</div>
          <div className="k">关联采购订单</div>
          <div><a className="link" onClick={() => nav(`/purchase/po/${bill.poId}`)}>{bill.poId}</a>（{po ? poBillType(po) : '—'}）</div>
          <div className="k">供应商</div><div>{nameOf(state.suppliers, bill.supplierId)}</div>
          <div className="k">项目</div><div>{projects}</div>
          <div className="k">业务日期</div>
          <div>
            <input type="date" value={bill.date || ''} onChange={(e) => actions.savePayBill(bill.id, { date: e.target.value })} />
          </div>
          <div className="k">应付合计</div>
          <div>
            ¥ {Math.round(d.total).toLocaleString()}
            {d.adjust !== 0 && <>（系统应付 ¥ {Math.round(d.base).toLocaleString()} {d.adjust > 0 ? '+' : '−'} 调整 ¥ {Math.abs(Math.round(d.adjust)).toLocaleString()}）</>}
          </div>
          <div className="k">已付 / 未付</div>
          <div>¥ {Math.round(d.paid).toLocaleString()} / <b>¥ {Math.round(d.unpaid).toLocaleString()}</b></div>
          <div className="k">备注</div>
          <div>
            <RemarkInput value={bill.remark} onSave={(v) => actions.savePayBill(bill.id, { remark: v })} />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>应付构成（按采购订单实际入库）</h3>
        <Table
          columns={[
            { key: 'productId', title: '物料', render: (r) => nameOf(state.products, r.productId) },
            { key: 'type', title: '物料类型', render: (r) => state.products.find((p) => p.id === r.productId)?.type || '—' },
            { key: 'qty', title: '下单数量', render: (r) => r.qty },
            { key: 'recvQty', title: '已入库数量', render: (r) => <b>{r.recvQty}</b> },
            { key: 'price', title: '单价', render: (r) => `¥ ${Number(r.price || 0).toLocaleString()}` },
            { key: 'amount', title: '应付金额', render: (r) => `¥ ${Math.round(r.amount).toLocaleString()}` },
          ]}
          rows={receivedLines}
        />
        {d.adjust !== 0 && (
          <>
            <h3 style={{ marginTop: 14 }}>应付调整</h3>
            <Table
              columns={[
                { key: 'date', title: '日期' },
                { key: 'amount', title: '调整金额', render: (r) => `${r.adjust > 0 ? '+' : '−'}¥ ${Math.abs(Math.round(r.adjust)).toLocaleString()}` },
                { key: 'reason', title: '调整原因', render: (r) => r.adjustReason || '—' },
                { key: 'note', title: '对应付款', render: (r) => `¥ ${Number(r.amount).toLocaleString()}` },
              ]}
              rows={(bill.settles || []).filter((s) => Number(s.adjust || 0) !== 0)}
            />
          </>
        )}
        <p>
          系统应付 ¥ {Math.round(d.base).toLocaleString()}
          {d.adjust !== 0 && <>　＋ 调整 {d.adjust > 0 ? '' : '−'}¥ {Math.abs(Math.round(d.adjust)).toLocaleString()}</>}
          　＝ <b>应付合计 ¥ {Math.round(d.total).toLocaleString()}</b>
        </p>
        <p className="hint">
          系统应付只按「<b>真正入库的数量</b> × 订单单价」算，没入库就不产生应付。
          供应商涨价、或者谈好抹掉零头，付款时在「应付调整」里加 / 减，并写清原因。
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>付款明细 {d.paid > 0 && `（已付 ¥${Math.round(d.paid).toLocaleString()}）`}</h3>
          {d.unpaid > 0 && <Btn kind="primary" onClick={payNow}>付款</Btn>}
        </div>
        <Table
          columns={[
            { key: 'id', title: '序号', render: (r, i) => i + 1 },
            { key: 'date', title: '付款日期' },
            { key: 'amount', title: '本次付款', render: (r) => <b>¥ {Number(r.amount).toLocaleString()}</b> },
            { key: 'adjust', title: '应付调整', render: (r) => (Number(r.adjust || 0) ? `${r.adjust > 0 ? '+' : '−'}¥ ${Math.abs(Math.round(r.adjust)).toLocaleString()}（${r.adjustReason || '—'}）` : '—') },
            { key: 'method', title: '结算方式', render: (r) => r.method || '—' },
            { key: 'note', title: '备注', render: (r) => r.note || '—' },
            {
              key: 'act',
              title: '操作',
              render: (r) => (
                <OpsLinks items={[{ label: '回退', onClick: () => ask('回退本笔付款', `回退 ¥${Number(r.amount).toLocaleString()}，回退后本单未付会变多。`, () => actions.rollbackPaySettle(bill.id, r.id)) }]} />
              ),
            },
          ]}
          rows={bill.settles || []}
        />
        {(bill.settles || []).length === 0 && <p className="hint">还没付过款。点右上角「付款」登记第一笔。</p>}
      </div>
    </Page>
  )
}

/**
 * 采购订单「单据状态」标签。
 * 采购订单列表 / 采购订单详情 / 付款登记**共用这一个**，保证三处口径完全一致。
 */
export function PoDocTag({ po }) {
  return <DocStatus value={poDocStatusLabel(poDocStatus(po))} />
}

function poKind(state, po) {
  const types = new Set()
  ;(po.lines || []).forEach((l) => {
    const t = state.products.find((p) => p.id === l.productId)?.type
    if (t === '项目料') types.add('项目原料')
    if (t === '常备料') types.add('库存常备料')
  })
  if (types.size === 2) return '混合'
  if (types.has('库存常备料')) return '库存常备料'
  if (types.has('项目原料')) return '项目原料'
  return po.soId ? '项目原料' : '库存常备料'
}

/** 采购退货出库单状态口径：待出库 / 已出库 / 已取消 */
function returnOutStage(r) {
  return returnOutDocStatus(r)
}

/** 采购退货单的状态口径：草稿 / 已完成 / 已取消 */
function returnStage(state, r) {
  return returnDocStatus(r)
}

export function ReturnList() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { ask, node } = useDialog()
  const [tab, setTab] = useState(sp.get('tab') || 'all')
  const [q, setQ] = useState('')
  const [poId, setPoId] = useState('')
  const [soId, setSoId] = useState('')
  const [page, setPage] = useState(1)

  const counts = useMemo(() => {
    const all = state.returns
    return {
      all: all.length,
      draft: all.filter((r) => returnDocStatus(r) === 'draft').length,
      done: all.filter((r) => returnDocStatus(r) === 'done').length,
      cancelled: all.filter((r) => returnDocStatus(r) === 'cancelled').length,
    }
  }, [state.returns, state.returnOuts])

  const rows = state.returns.filter((r) => {
    const po = state.purchaseOrders.find((p) => p.id === r.poId)
    const proj = state.salesOrders.find((s) => s.id === po?.soId)?.projectName || ''
    if (tab !== 'all' && returnStage(state, r) !== tab) return false
    if (q && !r.id.includes(q) && !(r.reason || '').includes(q) && !proj.includes(q)) return false
    if (poId && r.poId !== poId) return false
    if (soId === '__none__' && po?.soId) return false
    if (soId && soId !== '__none__' && po?.soId !== soId) return false
    return true
  })
  return (
    <Page crumb={<>采购管理 / 采购退货</>}>
      {node}
      <div className="card">
        <Tabs
          value={tab}
          onChange={(k) => { setTab(k); setPage(1) }}
          items={[
            { key: 'all', label: '全部', count: counts.all },
            { key: 'draft', label: '草稿', count: counts.draft },
            { key: 'done', label: '已完成', count: counts.done },
            { key: 'cancelled', label: '已取消', count: counts.cancelled },
          ]}
        />
        <Filters onQuery={() => setPage(1)} onReset={() => { setQ(''); setPoId(''); setSoId(''); setPage(1) }}>
          <Field label="退货单 / 原因"><input value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="项目">
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">全部项目</option>
              <option value="__none__">不挂项目</option>
              {state.salesOrders.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
          <Field label="采购订单">
            <select value={poId} onChange={(e) => setPoId(e.target.value)}>
              <option value="">全部</option>
              {state.purchaseOrders.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
            </select>
          </Field>
        </Filters>
        <div className="list-toolbar">
          <Btn kind="primary" onClick={() => nav('/purchase/return/new')}>新增</Btn>
        </div>
        <Table
          onRow={(r) => nav(`/purchase/return/${r.id}`)}
          columns={[
            { key: 'id', title: '退货单', link: true },
            { key: 'st', title: '单据状态', render: (r) => <DocStatus value={returnDocStatusLabel(returnDocStatus(r))} /> },
            { key: 'poId', title: '关联采购订单' },
            { key: 'proj', title: '项目', render: (r) => {
              const po = state.purchaseOrders.find((p) => p.id === r.poId)
              return po?.soId ? (state.salesOrders.find((s) => s.id === po.soId)?.projectName || po.soId) : '不挂项目'
            } },
            { key: 'mat', title: '物料', render: (r) => (r.lines || []).map((l) => nameOf(state.products, l.productId)).join('、') },
            { key: 'qty', title: '退货数量', render: (r) => (r.lines || []).reduce((s, l) => s + Number(l.qty || 0), 0) },
            { key: 'reason', title: '原因', render: (r) => r.reason || '—' },
            {
              key: 'act',
              title: '操作',
              render: (r) => (
                <OpsLinks
                  items={[
                    { label: '查看', onClick: () => nav(`/purchase/return/${r.id}`) },
                    r.confirmStatus === 'draft' && r.closeStatus !== 'closed' && {
                      label: '确认',
                      onClick: () => ask('确认采购退货单', '确认后会自动生成一张「采购退货出库单」（待出库）。之后到「采购退货出库单」点确认出库即可，出库后自动冲减应付。', () => actions.confirmReturn(r.id)),
                    },
                    r.confirmStatus === 'confirmed' && { label: '回退确认', onClick: () => ask('回退确认', '回到草稿，并撤销自动生成的待出库出库单。出库单已出库时须先回退出库。', () => actions.rollbackReturn(r.id)) },
                    returnCanCancel(r) && { label: '取消', onClick: () => ask('取消退货单', '只有草稿能取消。取消后可在「已取消」里回退。', () => actions.cancelReturn(r.id)) },
                    r.closeStatus === 'closed' && { label: '回退', onClick: () => ask('回退退货单', '取消只是打了作废标记，单据内容没动过；回退后回到取消前的状态。', () => actions.reopenReturn(r.id)) },
                    r.confirmStatus === 'draft' && r.closeStatus !== 'closed' && { label: '删除', onClick: () => ask('删除退货单', '仅草稿可删。删后对应入库单才可回退。', () => actions.deleteReturn(r.id)) },
                  ]}
                />
              ),
            },
          ]}
          rows={slicePage(rows, page)}
        />
        <Pager total={rows.length} page={page} onChange={setPage} />
      </div>
    </Page>
  )
}

/** 采购退货出库单：退货单数与出库进度分开看，挂一级菜单 */
export function ReturnOutList() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { ask, node } = useDialog()
  const [tab, setTab] = useState(sp.get('tab') || 'all')
  const [q, setQ] = useState(sp.get('q') || '')
  const [poId, setPoId] = useState('')
  const [rtnId, setRtnId] = useState('')
  const [page, setPage] = useState(1)

  const counts = useMemo(() => {
    const all = state.returnOuts
    return {
      all: all.length,
      pending: all.filter((r) => returnOutStage(r) === 'pending').length,
      done: all.filter((r) => returnOutStage(r) === 'done').length,
      cancelled: all.filter((r) => returnOutStage(r) === 'cancelled').length,
    }
  }, [state.returnOuts])

  const rows = state.returnOuts.filter((r) => {
    if (tab !== 'all' && returnOutStage(r) !== tab) return false
    if (q && !r.id.includes(q) && !(r.rtnId || '').includes(q)) return false
    if (poId && r.poId !== poId) return false
    if (rtnId && r.rtnId !== rtnId) return false
    return true
  })

  return (
    <Page crumb={<>采购管理 / 采购退货出库单</>}>
      {node}
      <div className="card">
        <Tabs
          value={tab}
          onChange={(k) => { setTab(k); setPage(1) }}
          items={[
            { key: 'all', label: '全部', count: counts.all },
            { key: 'pending', label: '待出库', count: counts.pending },
            { key: 'done', label: '已出库', count: counts.done },
            { key: 'cancelled', label: '已取消', count: counts.cancelled },
          ]}
        />
        <Filters onQuery={() => setPage(1)} onReset={() => { setQ(''); setPoId(''); setRtnId(''); setPage(1) }}>
          <Field label="出库单 / 退货单"><input value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="采购订单">
            <select value={poId} onChange={(e) => setPoId(e.target.value)}>
              <option value="">全部</option>
              {state.purchaseOrders.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
            </select>
          </Field>
          <Field label="采购退货单">
            <select value={rtnId} onChange={(e) => setRtnId(e.target.value)}>
              <option value="">全部</option>
              {state.returns.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
            </select>
          </Field>
        </Filters>
        <Table
          onRow={(r) => nav(`/purchase/return/${r.rtnId}`)}
          columns={[
            { key: 'id', title: '退货出库单' },
            { key: 'st', title: '单据状态', render: (r) => <DocStatus value={returnOutDocStatusLabel(returnOutStage(r))} /> },
            { key: 'rtnId', title: '关联退货单（点进详情）', link: true },
            { key: 'poId', title: '采购订单' },
            { key: 'sup', title: '供应商', render: (r) => nameOf(state.suppliers, state.purchaseOrders.find((p) => p.id === r.poId)?.supplierId) || '—' },
            { key: 'mat', title: '物料', render: (r) => (r.lines || []).map((l) => nameOf(state.products, l.productId)).join('、') || '—' },
            { key: 'qty', title: '数量', render: (r) => (r.lines || []).reduce((s, l) => s + Number(l.qty || 0), 0) },
            {
              key: 'cut',
              title: '冲减应付',
              // 出库即冲减（不需要"对方签收"这一步）；回退出库后自动加回
              render: (r) => (returnOutStage(r) === 'done'
                ? `−¥ ${Math.round(returnOutAmount(r, state)).toLocaleString()}`
                : '—'),
            },
            {
              key: 'act',
              title: '操作',
              render: (r) => (
                <OpsLinks
                  items={[
                    returnOutCanCancel(r) && { label: '确认出库', onClick: () => ask('确认退货出库', '扣可用库存，并按采购单价冲减应付。', () => actions.confirmReturnOut(r.id)) },
                    r.status === 'done' && { label: '回退出库', onClick: () => ask('回退出库', '库存加回、应付加回。', () => actions.rollbackReturnOut(r.id)) },
                    returnOutCanCancel(r) && { label: '取消', onClick: () => ask('取消退货出库单', '还没出库就能取消。取消后可在「已取消」里回退。', () => actions.cancelReturnOut(r.id)) },
                    r.closeStatus === 'closed' && { label: '回退', onClick: () => ask('回退退货出库单', '取消只是打了作废标记，单据内容没动过；回退后回到取消前的状态。', () => actions.reopenReturnOut(r.id)) },
                  ]}
                />
              ),
            },
          ]}
          rows={slicePage(rows, page)}
        />
        <Pager total={rows.length} page={page} onChange={setPage} />
        <p className="hint">
          退货出库单**由采购退货单确认时自动生成**，不用手工建。确认出库后即扣可用库存、并按采购单价**冲减应付**；回退出库会加回。
        </p>
      </div>
    </Page>
  )
}

export function ReturnForm() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { ask, node } = useDialog()
  const [poId, setPoId] = useState(sp.get('po') || state.purchaseOrders[0]?.id || '')
  const po = state.purchaseOrders.find((p) => p.id === poId)
  const [qty, setQty] = useState(() => Object.fromEntries((po?.lines || []).map((l) => [l.productId, 0])))
  const [reason, setReason] = useState('')
  const rows = (po?.lines || []).map((l, i) => {
    const p = state.products.find((x) => x.id === l.productId)
    return {
      id: i,
      productId: l.productId,
      name: p?.name || l.productId,
      unit: p?.unit || '',
      price: l.price || 0,
      canBack: returnableQty(poId, l.productId),
    }
  })
  const payload = () => rows
    .map((r) => ({ productId: r.productId, qty: Number(qty[r.productId] || 0) }))
    .filter((l) => l.qty > 0)
  const canBackTotal = rows.reduce((s, r) => s + r.canBack, 0)

  function pickPo(id) {
    setPoId(id)
    const p = state.purchaseOrders.find((x) => x.id === id)
    setQty(Object.fromEntries((p?.lines || []).map((l) => [l.productId, 0])))
  }

  function create() {
    if (!canBackTotal) return { ok: false, message: '这张采购订单没有可退的数量' }
    return actions.createReturn(poId, payload(), reason)
  }

  return (
    <Page crumb={<>采购管理 / 采购退货 / 新建</>} title="新建采购退货单" extra={<Btn onClick={() => nav('/purchase/return')}>返回</Btn>}>
      {node}
      <div className="card">
        <div className="hint">必须挂采购订单。退货数量不能超过「已入库未退」；填 0 的行不生成明细。</div>
        <Field label="采购订单" required>
          <select value={poId} onChange={(e) => pickPo(e.target.value)}>
            {state.purchaseOrders.map((p) => (
              <option key={p.id} value={p.id}>{p.id} {nameOf(state.suppliers, p.supplierId)}</option>
            ))}
          </select>
        </Field>
        <Table
          columns={[
            { key: 'name', title: '物料' },
            { key: 'canBack', title: '已入库未退', render: (r) => `${r.canBack} ${r.unit}` },
            { key: 'price', title: '采购单价', render: (r) => `¥ ${Number(r.price || 0).toLocaleString()}` },
            {
              key: 'qty',
              title: '本次退货数量',
              render: (r) => (
                <input
                  type="number"
                  min="0"
                  max={r.canBack}
                  className="safety-input"
                  value={qty[r.productId] ?? 0}
                  onChange={(e) => setQty({ ...qty, [r.productId]: Number(e.target.value) })}
                />
              ),
            },
          ]}
          rows={rows}
        />
        {canBackTotal === 0 && <p className="hint">这张采购订单没有可退数量（还没确认入库，或者已经全退完了）。</p>}
        <Field label="退货原因"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如尺寸偏差" /></Field>
        <div className="row-actions" style={{ marginTop: 12 }}>
          <Btn onClick={() => ask('保存退货草稿', '存成草稿，可继续在详情页改数量 / 原因；确认后才会生成退货出库单。', () => {
            const r = create()
            if (r.ok) nav(`/purchase/return/${r.id}`)
            return r
          })}>保存草稿</Btn>
          <Btn kind="primary" onClick={() => ask('确认采购退货单', '确认后会自动生成一张「采购退货出库单」（待出库）。之后到「采购退货出库单」点确认出库即可，出库后自动冲减应付。', () => {
            const r = create()
            if (!r.ok) return r
            const r2 = actions.confirmReturn(r.id)
            if (r2.ok) nav(`/purchase/return/${r.id}`)
            return r2
          })}>确认退货</Btn>
        </div>
      </div>
    </Page>
  )
}

/** 采购退货单详情：草稿能改数量/原因并确认；已确认能回退确认；能直接跳到自动生成的退货出库单 */
export function ReturnDetail() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { id } = useParams()
  const { ask, node } = useDialog()
  const rtn = state.returns.find((r) => r.id === id)
  const [qty, setQty] = useState(() => Object.fromEntries((rtn?.lines || []).map((l) => [l.productId, l.qty])))
  const [reason, setReason] = useState(rtn?.reason || '')
  if (!rtn) {
    return (
      <Page crumb={<>采购管理 / 采购退货</>}>
        <div className="card">退货单不存在，可能已被删除。<Btn onClick={() => nav('/purchase/return')}>返回列表</Btn></div>
      </Page>
    )
  }
  const po = state.purchaseOrders.find((p) => p.id === rtn.poId)
  const st = returnDocStatus(rtn)
  const draft = st === 'draft'
  const rtos = state.returnOuts.filter((o) => o.rtnId === id)
  const rows = (rtn.lines || []).map((l, i) => {
    const p = state.products.find((x) => x.id === l.productId)
    const order = (po?.lines || []).find((x) => x.productId === l.productId)
    const v = draft ? Number(qty[l.productId] ?? l.qty) : Number(l.qty)
    return { id: i, productId: l.productId, name: p?.name || l.productId, unit: p?.unit || '', price: order?.price || 0, canBack: returnableQty(rtn.poId, l.productId, state, id), qty: v }
  })
  const amount = rows.reduce((s, r) => s + Number(r.price || 0) * Number(r.qty || 0), 0)
  const payload = () => rows
    .map((r) => ({ productId: r.productId, qty: Number(qty[r.productId] ?? r.qty) }))
    .filter((l) => l.qty > 0)

  return (
    <Page crumb={<>采购管理 / 采购退货 / {id}</>} title={`采购退货单 ${id}`} extra={<Btn onClick={() => nav('/purchase/return')}>返回列表</Btn>}>
      {node}
      <div className="card">
        <div className="detail-grid">
          <div className="k">单据状态</div><div><DocStatus value={returnDocStatusLabel(st)} /></div>
          <div className="k">关联采购订单</div>
          <div className="link" onClick={() => po && nav(`/purchase/po/${po.id}`)}>{rtn.poId}</div>
          <div className="k">供应商</div><div>{nameOf(state.suppliers, po?.supplierId) || '—'}</div>
          <div className="k">项目</div>
          <div>{po?.soId ? (state.salesOrders.find((s) => s.id === po.soId)?.projectName || po.soId) : '不挂项目'}</div>
          <div className="k">退货金额</div><div><b>¥ {Math.round(amount).toLocaleString()}</b>（按采购单价算，出库后冲减应付）</div>
          <div className="k">创建时间</div><div>{rtn.createdAt || '—'}</div>
          <div className="k">确认时间</div><div>{rtn.confirmedAt || '未确认'}</div>
        </div>
      </div>

      <div className="card">
        <h3>退货明细</h3>
        <Table
          columns={[
            { key: 'name', title: '物料' },
            { key: 'canBack', title: '可退数量', render: (r) => `${r.canBack} ${r.unit}` },
            { key: 'price', title: '采购单价', render: (r) => `¥ ${Number(r.price || 0).toLocaleString()}` },
            {
              key: 'qty',
              title: '退货数量',
              render: (r) => (draft ? (
                <input
                  type="number"
                  min="0"
                  max={r.canBack}
                  className="safety-input"
                  value={qty[r.productId] ?? r.qty}
                  onChange={(e) => setQty({ ...qty, [r.productId]: Number(e.target.value) })}
                />
              ) : `${r.qty} ${r.unit}`),
            },
            { key: 'amt', title: '金额', render: (r) => `¥ ${Math.round(Number(r.price || 0) * Number(r.qty || 0)).toLocaleString()}` },
          ]}
          rows={rows}
        />
        <Field label="退货原因">
          {draft
            ? <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如尺寸偏差" />
            : <span>{rtn.reason || '—'}</span>}
        </Field>
      </div>

      <div className="card">
        <h3>关联的采购退货出库单</h3>
        {rtos.length === 0 ? (
          <p className="hint">还没有出库单。点「确认退货」会自动生成一张待出库的出库单。</p>
        ) : (
          <Table
            columns={[
              { key: 'id', title: '出库单' },
              { key: 'st', title: '单据状态', render: (r) => <DocStatus value={returnOutDocStatusLabel(returnOutDocStatus(r))} /> },
              { key: 'cut', title: '冲减应付', render: (r) => (r.status === 'done' ? `−¥ ${Math.round(returnOutAmount(r, state)).toLocaleString()}` : '出库后冲减') },
            ]}
            rows={rtos}
          />
        )}
        <div className="row-actions" style={{ marginTop: 12 }}>
          <Btn onClick={() => nav('/purchase/return-out')}>去采购退货出库单</Btn>
        </div>
      </div>

      <div className="row-actions">
        {draft && (
          <>
            <Btn onClick={() => ask('保存退货草稿', '保存数量 / 原因，仍是草稿。', () => actions.saveReturn(id, { reason, lines: payload() }))}>保存草稿</Btn>
            <Btn kind="primary" onClick={() => ask('确认采购退货单', '确认后会自动生成一张「采购退货出库单」（待出库）。之后到「采购退货出库单」点确认出库即可，出库后自动冲减应付。', () => actions.confirmReturn(id))}>确认退货</Btn>
          </>
        )}
        {rtn.confirmStatus === 'confirmed' && rtn.closeStatus !== 'closed' && (
          <Btn onClick={() => ask('回退确认', '回到草稿，并撤销自动生成的待出库出库单。出库单已出库时须先回退出库。', () => actions.rollbackReturn(id))}>回退确认</Btn>
        )}
        {returnCanCancel(rtn) && (
          <Btn kind="danger" onClick={() => ask('取消退货单', '只有草稿能取消。取消后可在「已取消」里回退。', () => actions.cancelReturn(id))}>取消</Btn>
        )}
        {rtn.closeStatus === 'closed' && (
          <Btn onClick={() => ask('回退退货单', '取消只是打了作废标记，单据内容没动过；回退后回到取消前的状态。', () => actions.reopenReturn(id))}>回退</Btn>
        )}
        {draft && (
          <Btn kind="danger" onClick={() => ask('删除退货单', '仅草稿可删，删掉后不再出现在列表；已记入操作记录。', () => {
            const r = actions.deleteReturn(id)
            if (r.ok) nav('/purchase/return')
            return r
          })}>删除草稿</Btn>
        )}
      </div>
    </Page>
  )
}

export function PartForm() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { ask, node } = useDialog()
  const openSos = state.salesOrders.filter((s) => {
    const out = state.outboundOrders.find((o) => o.soId === s.id)
    return s.confirmStatus === 'confirmed' && s.closeStatus === 'open' && !out?.trained
  })
  const [form, setForm] = useState({
    soId: sp.get('so') || openSos[0]?.id || '',
    productId: state.products.find((p) => p.type !== '成品')?.id || '',
    qty: 1,
    supplierId: state.suppliers[0].id,
    address: '本厂',
    customAddress: '',
    price: '',
    confirm: true,
  })
  const product = state.products.find((p) => p.id === form.productId)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <Page crumb={<>采购管理 / 补件采购</>}>
      {node}
      <FormCard
        title="补件采购"
        extra={
          <>
            <Btn kind="ghost" onClick={() => nav('/purchase/po')}>← 返回采购订单</Btn>
            <Btn kind="primary" onClick={() => ask('确认生成补件采购订单', '零散补件：不带泵清单与采购建议。项目料必须挂项目；常备料不挂项目。生成后在采购订单列表中查看、取消。', () => {
              const r = actions.createPartPO(form)
              if (r.ok) nav('/purchase/po')
              return r
            })}>确认生成补件采购订单</Btn>
          </>
        }
      >
        <Section title="基本信息" hint="补件是采购订单的一种特殊形式：只选物料与项目（如需），不带出泵清单/设计/采购建议。生成后统一在「采购订单」列表展示与取消。">
          <div className="form-stack">
            <Field label="物料" required>
              <select value={form.productId} onChange={(e) => set('productId', e.target.value)}>
                {state.products.filter((p) => p.type !== '成品').map((p) => (
                  <option key={p.id} value={p.id}>{p.name}（{p.type}）</option>
                ))}
              </select>
            </Field>
            <Field label="物料类型">
              <input value={product?.type || ''} disabled />
            </Field>
            {product?.type === '项目料' ? (
              <Field label="项目" required>
                <select value={form.soId} onChange={(e) => set('soId', e.target.value)}>
                  <option value="">请选择项目</option>
                  {openSos.map((s) => (
                    <option key={s.id} value={s.id}>{s.projectName}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="项目">
                <input value="—" disabled />
              </Field>
            )}
            <Field label="供应商" required>
              <select value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
                {state.suppliers.filter((s) => s.status !== 'off').map((s) => (
                  <option key={s.id} value={s.id}>{s.name}（{s.type}）</option>
                ))}
              </select>
            </Field>
            <Field label="数量" required>
              <input type="number" value={form.qty} onChange={(e) => set('qty', e.target.value)} />
            </Field>
            <Field label="单价">
              <input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="可空，系统给默认" />
            </Field>
            <Field label="送达地址" required>
              <select value={form.address} onChange={(e) => set('address', e.target.value)}>
                <option value="本厂">本厂</option>
                <option value="客户">客户地址</option>
              </select>
            </Field>
            {form.address === '客户' && (
              <Field label="客户详细地址">
                <input value={form.customAddress} onChange={(e) => set('customAddress', e.target.value)} placeholder="支持手输" />
              </Field>
            )}
          </div>
        </Section>
      </FormCard>
    </Page>
  )
}
