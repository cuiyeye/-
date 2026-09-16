import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fgOf, nameOf, othersOutStatusLabel, useStore } from '../store'
import { Btn, DocStatus, Field, Filters, FormCard, Modal, OpsLinks, Page, Section, Table, Tabs, useDialog } from '../ui'

function transitQty(state, productId) {
  return state.purchaseOrders.reduce((sum, po) => {
    if (po.closeStatus === 'closed' || po.completeStatus === 'done') return sum
    const ordered = po.lines.filter((l) => l.productId === productId).reduce((s, l) => s + l.qty, 0)
    if (!ordered) return sum
    const got = state.inboundOrders
      .filter((pi) => pi.poId === po.id && pi.confirmed)
      .reduce((s, pi) => s + pi.lines.filter((l) => l.productId === productId).reduce((a, l) => a + l.qty, 0), 0)
    return sum + Math.max(0, ordered - got)
  }, 0)
}

/**
 * 成品的两个台数口径（成品不通采购，所以成品没有「采购在途」）：
 *   way    = 已出库、还没签收 → 成品在途
 *   signed = 已出库、客户那头收货确认了 → 已签收
 */
function fgQtyOf(state, productId, stage) {
  return (state.outboundOrders || [])
    .filter((o) => o.status === 'done' && (stage === 'signed' ? !!o.signed : !o.signed))
    .filter((o) => fgOf(state, (state.salesOrders || []).find((s) => s.id === o.soId))?.id === productId)
    .reduce((sum, o) => sum + Number(o.qty || 0), 0)
}

/** 安全库存输入：只改本地草稿，统一由弹窗底部的「确认」一起保存（保存才写操作记录） */
function SafetyInput({ value, onChange }) {
  return (
    <input
      type="number"
      min="0"
      className="safety-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export default function Stock() {
  const { tab } = useParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const [pid, setPid] = useState(state.products[0].id)
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState('')
  const [dir, setDir] = useState('repair')
  const [dim, setDim] = useState('material')
  const [sq, setSq] = useState('')
  const [stype, setStype] = useState('')
  const [slow, setSlow] = useState('')
  const [lq, setLq] = useState('')
  const [ldir, setLdir] = useState('')
  const [ltype, setLtype] = useState('')
  const [scrapQty, setScrapQty] = useState(1)
  const [scrapReason, setScrapReason] = useState('报废')
  const [scrapRemark, setScrapRemark] = useState('')
  const [safetyOpen, setSafetyOpen] = useState(false)
  const [safetyDraft, setSafetyDraft] = useState({})

  const titles = {
    query: '库存查询',
    ledger: '库存流水',
    'other-in': '其他入库',
    count: '盘点',
    adjust: '状态调整',
    'other-out': '其他出库',
  }

  const queryRows = state.products.filter((p) => {
    if (dim === 'fg' ? p.type !== '成品' : p.type === '成品') return false
    if (sq && !p.name.includes(sq) && !p.id.includes(sq)) return false
    if (stype && p.type !== stype) return false
    const low = p.safety > 0 && p.stock < p.safety
    if (slow === 'yes' && !low) return false
    if (slow === 'no' && low) return false
    return true
  })
  const ledgerRows = (state.ledger || []).filter((r) => {
    const name = nameOf(state.products, r.productId)
    if (lq && !String(r.productId || '').includes(lq) && !String(name).includes(lq) && !String(r.billId || '').includes(lq) && !String(r.remark || '').includes(lq)) return false
    if (ldir && r.dir !== ldir) return false
    if (ltype && r.type !== ltype) return false
    return true
  })
  const p = state.products.find((x) => x.id === pid)
  const stockProducts = state.products.filter((x) => x.type === '常备料')

  /** 打开弹窗：先把当前值灌进草稿，改完点「确认」才提交 */
  function openSafety() {
    setSafetyDraft(Object.fromEntries(stockProducts.map((x) => [x.id, String(Number(x.safety) || 0)])))
    setSafetyOpen(true)
  }

  /** 弹窗底部「确认」：把改过的安全库存一次性提交，每项都会写操作记录 */
  function saveSafety() {
    const changed = stockProducts.filter((x) => String(Number(x.safety) || 0) !== String(safetyDraft[x.id] ?? ''))
    changed.forEach((x) => actions.setSafety(x.id, Number(safetyDraft[x.id]) || 0))
    setSafetyOpen(false)
    if (changed.length) flash({ ok: true, message: `已保存 ${changed.length} 项安全库存（已写操作记录）` })
  }

  return (
    <Page crumb={<>库存管理 / {titles[tab] || '库存'}</>}>
      {node}
      {tab === 'query' && (
        <div className="card">
          <Tabs
            value={dim}
            onChange={setDim}
            items={[
              { key: 'material', label: '生产物料', count: state.products.filter((x) => x.type !== '成品').length },
              { key: 'fg', label: '成品', count: state.products.filter((x) => x.type === '成品').length },
            ]}
          />
          <div className="filters">
            <Field label="名称 / 编号"><input value={sq} onChange={(e) => setSq(e.target.value)} /></Field>
            <Field label="分类">
              <select value={stype} onChange={(e) => setStype(e.target.value)}>
                <option value="">全部</option>
                <option>项目料</option>
                <option>常备料</option>
                <option>成品</option>
              </select>
            </Field>
            <Field label="低于下限">
              <select value={slow} onChange={(e) => setSlow(e.target.value)}>
                <option value="">全部</option>
                <option value="yes">是</option>
                <option value="no">否</option>
              </select>
            </Field>
          </div>
          <div className="row-actions" style={{ marginBottom: 12 }}>
            <Btn onClick={() => nav('/stock/ledger')}>库存流水</Btn>
            {/* 安全库存只针对常备料，切到「成品」就把这个入口收起来 */}
            {dim !== 'fg' && <Btn onClick={openSafety}>安全库存设置</Btn>}
          </div>
          <Table
            columns={[
              { key: 'id', title: '编号' },
              { key: 'name', title: '名称' },
              { key: 'spec', title: '规格', render: (r) => r.spec || '—' },
              { key: 'unit', title: '单位' },
              { key: 'type', title: '商品类型' },
              {
                key: 'stock',
                title: '可用',
                render: (r) =>
                  r.roll ? (
                    <span>
                      <b>{r.fullRolls}</b> 完整{r.openRollPct != null ? <>，1 开封剩 {r.openRollPct}%</> : ''}
                      <br />
                      <span className="cell-mute">{r.stock} 卷</span>
                    </span>
                  ) : (
                    r.stock
                  ),
              },
              { key: 'repair', title: '在修' },
              { key: 'scrap', title: '报废' },
              // 成品不通采购、也没有安全库存：成品视图只看「成品在途」和「已签收」，不放「采购在途」
              ...(dim === 'fg'
                ? [
                    { key: 'fgWay', title: '成品在途', render: (r) => fgQtyOf(state, r.id, 'way') },
                    { key: 'fgSigned', title: '已签收', render: (r) => fgQtyOf(state, r.id, 'signed') },
                  ]
                : [
                    {
                      key: 'safety',
                      title: '安全库存',
                      // 这里只展示，不改；要改点上面的「安全库存设置」
                      render: (r) => (r.type === '常备料' && Number(r.safety) > 0 ? Number(r.safety) : '—'),
                    },
                    { key: 'low', title: '低于下限', render: (r) => (r.safety > 0 && r.stock < r.safety ? '是' : '否') },
                    { key: 'way', title: '采购在途', render: (r) => transitQty(state, r.id) },
                    {
                      key: 'act',
                      title: '操作',
                      render: (r) => (
                        r.type === '常备料' && r.safety > 0 && r.stock < r.safety ? (
                          <OpsLinks items={[{ label: '补货', onClick: () => ask('安全库存补货', `为「${r.name}」生成常备料采购订单，不挂销售订单。`, () => actions.safetyBuy(r.id, Math.max(1, r.safety - r.stock), 'S03')) }]} />
                        ) : '—'
                      ),
                    },
                  ]),
            ]}
            rows={queryRows}
          />
        </div>
      )}
      {safetyOpen && (
        <Modal wide title="安全库存设置" okText="确认" onCancel={() => setSafetyOpen(false)} onOk={saveSafety}>
          <p className="hint">
            只对「常备料」有效。<b>可用低于安全库存时，系统会自动把它记入「异常中心」，并提醒上面勾选的人</b>。
            <br />
            这个弹窗只做一件事：<b>设置每个常备料的安全库存</b>。改完点下面的「确认」一起保存，会写操作记录。
            要补货请回上一页，在对应物料的「操作」里点「补货」。
          </p>
          <div className="safety-people">
            <span>低于安全库存时提醒谁：</span>
            <div className="people-picks">
              {state.employees.filter((emp) => emp.status !== 'off').map((emp) => (
                <label key={emp.id}>
                  <input
                    type="checkbox"
                    checked={(state.safetyCfg?.people || []).includes(emp.id)}
                    onChange={() => {
                      const cur = state.safetyCfg?.people || []
                      const nxt = cur.includes(emp.id) ? cur.filter((x) => x !== emp.id) : [...cur, emp.id]
                      actions.setSafetyCfg({ people: nxt })
                    }}
                  />
                  {emp.name}（{emp.role}）
                </label>
              ))}
            </div>
          </div>
          <Table
            columns={[
              { key: 'name', title: '常备料' },
              { key: 'stock', title: '可用', render: (r) => `${r.stock} ${r.unit || ''}` },
              {
                key: 'safety',
                title: '安全库存',
                render: (r) => (
                  <SafetyInput
                    value={safetyDraft[r.id] ?? ''}
                    onChange={(v) => setSafetyDraft({ ...safetyDraft, [r.id]: v })}
                  />
                ),
              },
            ]}
            rows={stockProducts}
          />
        </Modal>
      )}
      {tab === 'ledger' && (
        <div className="card">
          <Filters onQuery={() => {}} onReset={() => { setLq(''); setLdir(''); setLtype('') }}>
            <Field label="物料 / 来源单"><input value={lq} onChange={(e) => setLq(e.target.value)} /></Field>
            <Field label="方向">
              <select value={ldir} onChange={(e) => setLdir(e.target.value)}>
                <option value="">全部</option>
                <option value="in">入</option>
                <option value="out">出</option>
              </select>
            </Field>
            <Field label="类型">
              <select value={ltype} onChange={(e) => setLtype(e.target.value)}>
                <option value="">全部</option>
                {[...new Set((state.ledger || []).map((r) => r.type).filter(Boolean))].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            
        </Filters>
          <Table
            columns={[
              { key: 'at', title: '日期' },
              { key: 'productId', title: '物料', render: (r) => nameOf(state.products, r.productId) },
              { key: 'type', title: '类型' },
              { key: 'dir', title: '方向', render: (r) => (r.dir === 'in' ? '入' : '出') },
              { key: 'qty', title: '数量' },
              { key: 'billId', title: '来源单' },
              { key: 'remark', title: '备注' },
            ]}
            rows={ledgerRows}
          />
        </div>
      )}
      {tab === 'other-in' && (
        <div className="card">
          <div className="list-toolbar">
            <Btn kind="primary" onClick={() => nav('/stock/other-in/new')}>新增</Btn>
          </div>
          <Table
            columns={[
              { key: 'id', title: '单号' },
              { key: 'date', title: '日期' },
              { key: 'remark', title: '备注' },
              { key: 'st', title: '状态', render: (r) => (r.confirmed ? '已确认' : '待确认') },
              { key: 'qty', title: '行数', render: (r) => (r.lines || [{ productId: r.productId }]).length },
              {
                key: 'act',
                title: '操作',
                render: (r) => (
                  <OpsLinks
                    items={[
                      !r.confirmed && r.lines && { label: '确认', onClick: () => ask('确认其他入库', '进可用，不形成应付。', () => actions.confirmOtherIn(r.id)) },
                      !r.confirmed && { label: '删除', onClick: () => ask('删除其他入库草稿', '草稿删除后不再出现在列表，并记入操作记录。', () => actions.rollbackOtherIn(r.id)) },
                      r.confirmed && { label: '回退', onClick: () => ask('回退其他入库', '库存扣回，单据回到待确认。', () => actions.rollbackOtherIn(r.id)) },
                    ]}
                  />
                ),
              },
            ]}
            rows={state.othersIn}
          />
        </div>
      )}
      {tab === 'adjust' && (
        <div className="card">
          <div className="adjust-form">
            <div className="form-stack">
              <Field label="物料" required>
                <select value={pid} onChange={(e) => setPid(e.target.value)}>
                  {state.products.map((x) => (
                    <option key={x.id} value={x.id}>{x.name}（{x.type}）可用 {x.stock} / 在修 {x.repair}</option>
                  ))}
                </select>
              </Field>
              <Field label="调整方向" required>
                <select value={dir} onChange={(e) => setDir(e.target.value)}>
                  <option value="repair">可用 → 在修</option>
                  <option value="ok">在修 → 可用</option>
                </select>
              </Field>
              <Field label="数量" required>
                <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
              </Field>
              <Field label="原因">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：外壳磕伤待修" />
              </Field>
            </div>
            <p className="hint">
              即将把「{p?.name}」{qty} {p?.unit} {dir === 'repair' ? '从可用调入在修' : '从在修调回可用'}。
            </p>
            <div className="row-actions">
              <Btn kind="primary" onClick={() => ask(
                '确认状态调整',
                `确认将「${p?.name}」${qty}${p?.unit} ${dir === 'repair' ? '进入在修' : '调回可用'}？${reason ? `原因：${reason}` : ''}`,
                () => actions.adjust(pid, dir === 'repair', qty, reason)
              )}>确认调整</Btn>
            </div>
          </div>
          <h3 style={{ marginTop: 24 }}>调整记录</h3>
          <Table
            columns={[
              { key: 'at', title: '日期' },
              { key: 'productId', title: '物料', render: (r) => nameOf(state.products, r.productId) },
              { key: 'dir', title: '方向', render: (r) => (r.toRepair ? '可用 → 在修' : '在修 → 可用') },
              { key: 'qty', title: '数量' },
              { key: 'reason', title: '原因' },
              { key: 'act', title: '操作', render: (r) => (
                <OpsLinks items={[{ label: '回退', onClick: () => ask('回退状态调整', '库存方向改回去。', () => actions.rollbackAdjust(r.id)) }]} />
              ) },
            ]}
            rows={state.adjusts || []}
          />
        </div>
      )}
      {tab === 'other-out' && (
        <div className="card">
          <p className="hint">
            其他出库 = 报废 / 赠送 / 丢失 / 其他。填数量、选原因、写备注，确认后扣可用并写一条库存流水。
            操作填错可以在下面「回退」，库存会加回可用，单据保留显示「已回退」。
          </p>
          <div className="filters">
            <Field label="物料" required>
              <select value={pid} onChange={(e) => setPid(e.target.value)}>
                {state.products.map((x) => <option key={x.id} value={x.id}>{x.name}（可用 {x.stock} {x.unit || ''}）</option>)}
              </select>
            </Field>
            <Field label="数量" required>
              <input type="number" min="1" value={scrapQty} onChange={(e) => setScrapQty(e.target.value)} />
            </Field>
            <Field label="原因">
              <select value={scrapReason} onChange={(e) => setScrapReason(e.target.value)}>
                <option>报废</option>
                <option>赠送</option>
                <option>丢失</option>
                <option>其他</option>
              </select>
            </Field>
            <Field label="备注">
              <input value={scrapRemark} onChange={(e) => setScrapRemark(e.target.value)} placeholder="例如：搬运磕碰报废 / 送给职校做样机" />
            </Field>
          </div>
          <div className="row-actions" style={{ marginBottom: 12 }}>
            <Btn
              kind="danger"
              onClick={() => ask('其他出库', `把「${p?.name}」${scrapQty}${p?.unit || ''} 按「${scrapReason}」出库，扣减可用并写库存流水。确认？`, () => {
                const r = actions.scrap(pid, Number(scrapQty), scrapReason, scrapRemark)
                if (r.ok) setScrapRemark('')
                return r
              })}
            >
              确认出库
            </Btn>
          </div>
          <Table
            onRow={(r) => nav(`/stock/other-out/${r.id}`)}
            columns={[
              { key: 'id', title: '单号', link: true },
              { key: 'st', title: '单据状态', render: (r) => <DocStatus value={othersOutStatusLabel(r)} /> },
              { key: 'at', title: '日期' },
              { key: 'productId', title: '物料', render: (r) => nameOf(state.products, r.productId) },
              { key: 'qty', title: '数量' },
              { key: 'reason', title: '原因' },
              { key: 'remark', title: '备注', render: (r) => r.remark || '—' },
              {
                key: 'act',
                title: '操作',
                render: (r) => (
                  <OpsLinks
                    items={[
                      { label: '查看', onClick: () => nav(`/stock/other-out/${r.id}`) },
                      r.status !== 'returned' && { label: '回退', onClick: () => ask('回退其他出库', `把「${nameOf(state.products, r.productId)}」${r.qty} 加回可用，并撤掉这条流水；单据保留显示「已回退」。`, () => actions.rollbackScrap(r.id)) },
                    ]}
                  />
                ),
              },
            ]}
            rows={state.othersOut}
          />
        </div>
      )}
    </Page>
  )
}

/** 其他出库单详情：能看单据全貌 + 该单产生的库存流水，也能在这里回退 */
export function OtherOutDetail() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { id } = useParams()
  const { ask, node } = useDialog()
  const row = state.othersOut.find((o) => o.id === id)
  if (!row) {
    return (
      <Page crumb={<>库存管理 / 其他出库</>}>
        <div className="card">其他出库单不存在。<Btn onClick={() => nav('/stock/other-out')}>返回列表</Btn></div>
      </Page>
    )
  }
  const p = state.products.find((x) => x.id === row.productId)
  const back = row.status === 'returned'
  const logs = (state.ledger || []).filter((l) => l.billId === id)
  return (
    <Page crumb={<>库存管理 / 其他出库 / {id}</>} title={`其他出库单 ${id}`} extra={<Btn onClick={() => nav('/stock/other-out')}>返回列表</Btn>}>
      {node}
      <div className="card">
        <div className="detail-grid">
          <div className="k">单据状态</div><div><DocStatus value={othersOutStatusLabel(row)} /></div>
          <div className="k">物料</div><div>{p?.name || row.productId}{p?.spec ? `（${p.spec}）` : ''}</div>
          <div className="k">数量</div><div>{row.qty} {p?.unit || ''}</div>
          <div className="k">原因</div><div>{row.reason || '—'}</div>
          <div className="k">备注</div><div>{row.remark || '—'}</div>
          <div className="k">出库时间</div><div>{row.at || '—'}</div>
          <div className="k">回退时间</div><div>{row.returnedAt || '—'}</div>
          <div className="k">当前可用</div><div>{p?.stock ?? '—'} {p?.unit || ''}</div>
        </div>
        <p className="hint">
          库存影响：出库时扣减可用 {row.qty} {p?.unit || ''}，并写一条「{row.reason === '报废' ? '报废出库' : '其他出库'}」流水；
          回退会自动加回可用、再写一条回退流水，单据保留显示「已回退」。
        </p>
      </div>
      <div className="card">
        <h3>这张单的库存流水</h3>
        <Table
          columns={[
            { key: 'at', title: '时间' },
            { key: 'dir', title: '方向', render: (r) => (r.dir === 'in' ? '入' : '出') },
            { key: 'qty', title: '数量' },
            { key: 'type', title: '类型' },
            { key: 'remark', title: '备注', render: (r) => r.remark || '—' },
          ]}
          rows={logs}
        />
      </div>
      <div className="row-actions">
        <Btn onClick={() => nav('/stock/ledger')}>看全部流水</Btn>
        {!back && (
          <Btn kind="danger" onClick={() => ask('回退其他出库', `把「${p?.name}」${row.qty} 加回可用，并撤掉这条流水；单据保留显示「已回退」。`, () => actions.rollbackScrap(id))}>回退</Btn>
        )}
      </div>
    </Page>
  )
}

export function OtherInForm() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, node } = useDialog()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [remark, setRemark] = useState('')
  const [lines, setLines] = useState([{ productId: state.products[0].id, qty: 1 }])

  function setLine(i, k, v) {
    const n = [...lines]
    n[i] = { ...n[i], [k]: v }
    setLines(n)
  }

  return (
    <Page crumb={<>库存管理 / 其他入库 / 新增</>}>
      {node}
      <FormCard
        title="新增其他入库单"
        extra={
          <>
            <Btn kind="ghost" onClick={() => nav('/stock/other-in')}>← 返回列表</Btn>
            <Btn kind="primary" onClick={() => ask('保存待确认', '保存后仍须点确认才会进可用。', () => {
              const r = actions.createOtherIn({ date, remark, lines })
              if (r.ok) nav('/stock/other-in')
              return r
            })}>保存待确认</Btn>
          </>
        }
      >
        <Section title="表头" hint="不挂采购订单、不形成应付。确认后才进可用。">
          <div className="form-stack">
            <Field label="入库日期" required>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="备注">
              <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="期初库存 / 赠送 / 捡到 / 其他来源" />
            </Field>
          </div>
        </Section>
        <Section title="明细">
          <Table
            columns={[
              {
                key: 'productId',
                title: '物料',
                render: (r, i) => (
                  <select value={r.productId} onChange={(e) => setLine(r.id, 'productId', e.target.value)}>
                    {state.products.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.type}）</option>)}
                  </select>
                ),
              },
              {
                key: 'qty',
                title: '数量',
                render: (r) => (
                  <input type="number" value={r.qty} onChange={(e) => setLine(r.id, 'qty', Number(e.target.value))} />
                ),
              },
            ]}
            rows={lines.map((l, i) => ({ ...l, id: i }))}
          />
          <Btn onClick={() => setLines([...lines, { productId: state.products[0].id, qty: 1 }])}>加行</Btn>
        </Section>
      </FormCard>
    </Page>
  )
}
