import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { bomCanCancel, bomDocStatus, bomStatusLabel, bomStatusOf, delayTone, designCanCancel, designDocStatus, designDocStatusLabel, finishKind, finishKindLabel, isBomPo, nameOf, now, reminderOf, useStore } from '../store'
import { Btn, DocStatus, Field, Filters, FormCard, inboundTag, Modal, OpsLinks, Page, Pager, ProgressCell, Section, Table, Tabs, Tag, slicePage, useDialog } from '../ui'
import { useExReport } from '../exReport'

function fmtSize(n) {
  if (typeof n === 'string') return n
  if (!n) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  return `${(n / 1e3).toFixed(1)} KB`
}

const BOM_TEMPLATE = '物料名称,规格,单位,商品类型,单台用量,供应商\n定制关节座,铝合金,件,项目料,1,精工 CNC\n线材,2.5平方,卷,常备料,1,网购渠道\n'

function finishKindTag(kind) {
  // 完成类只有「已完成」一个词，晚没晚用括号说明（不再造"超期完成 / 延期完成"的新词）
  if (kind === 'late') return <Tag color="mute">已完成（晚于计划）</Tag>
  if (kind === 'delay') return <Tag color="mute">已完成（晚于计划）</Tag>
  if (kind === 'ok') return <Tag color="green">已完成（按期）</Tag>
  if (kind === 'none') return <Tag>没有计划完成日</Tag>
  return null
}

function bomTag(st) {
  return <DocStatus value={bomStatusLabel(st)} />
}

function bomLocked(k) {
  return k === 'done' || k === 'ordered' || k === 'cancelled'
}

function isImageFile(f) {
  if (!f) return false
  if (String(f.type || '').startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name || '')
}

function isPdfFile(f) {
  if (!f) return false
  if (String(f.type || '') === 'application/pdf') return true
  return /\.pdf$/i.test(f.name || '')
}

function fileSrc(f) {
  return f?.dataUrl || f?.url || ''
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('读不出来'))
    r.readAsDataURL(file)
  })
}

function datePart(s) {
  return String(s || '').replace('T', ' ').slice(0, 10)
}

function timePart(s) {
  const t = String(s || '').replace('T', ' ').slice(11, 19)
  if (t.length === 5) return `${t}:00`
  return t
}

function joinAt(date, time) {
  const t = time.length === 5 ? `${time}:00` : time
  return `${date} ${t}`
}

/** 设计任务状态口径：草稿（创建了没完成）/ 已完成 / 已取消 */
function designStage(state, soId) {
  const des = state.designTasks.find((d) => d.soId === soId)
  if (!des) return 'none'
  return designDocStatus(des)
}

function designTag(t) {
  const k = designDocStatus(t)
  if (k === 'cancelled') return <span className="tag">已取消</span>
  if (k === 'draft') return <span className="tag">草稿</span>
  return <span className="tag tag-green">已完成</span>
}

export function DesignList() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const ex = useExReport()
  const [tab, setTab] = useState('all')
  const [soId, setSoId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [page, setPage] = useState(1)
  const [newOpen, setNewOpen] = useState(false)
  const [pickId, setPickId] = useState('')
  const cfg = reminderOf(state, 'design')
  const projects = state.salesOrders.filter((s) => s.confirmStatus === 'confirmed' && s.closeStatus === 'open')
  const blank = projects.filter((s) => !state.designTasks.some((d) => d.soId === s.id))
  /** 列表以「已创建的设计任务」为行，没建过的项目只出现在新增弹窗里 */
  const rows0 = state.designTasks.map((d) => state.salesOrders.find((s) => s.id === d.soId)).filter(Boolean)

  const counts = useMemo(() => ({
    all: rows0.length,
    draft: rows0.filter((s) => designStage(state, s.id) === 'draft').length,
    done: rows0.filter((s) => designStage(state, s.id) === 'done').length,
    cancelled: rows0.filter((s) => designStage(state, s.id) === 'cancelled').length,
  }), [rows0, state.designTasks])

  const rows = rows0.filter((r) => {
    const des = state.designTasks.find((d) => d.soId === r.id)
    if (tab !== 'all' && designStage(state, r.id) !== tab) return false
    if (soId && r.id !== soId) return false
    if (customerId && r.customerId !== customerId) return false
    return true
  })
  return (
    <Page crumb={<>设计管理 / 设计任务</>}>
      {node}
      {ex.node}
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
        <Filters onQuery={() => setPage(1)} onReset={() => { setSoId(''); setCustomerId(''); setPage(1) }}>
          <Field label="项目">
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">全部项目</option>
              {rows0.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
          <Field label="客户">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">全部</option>
              {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </Filters>
        <div className="list-toolbar">
          <Btn kind="primary" onClick={() => { setPickId(blank[0]?.id || ''); setNewOpen(true) }}>新增</Btn>
        </div>
        <Table
          onRow={(r) => nav(`/design/${r.id}`)}
          columns={[
            { key: 'projectName', title: '项目', link: true },
            {
              key: 'des',
              title: '单据状态',
              // 单据状态就是单据状态，不带红绿灯（延期提醒统一走首页实时提醒 / 异常中心）
              render: (r) => <DocStatus value={designDocStatusLabel(designDocStatus(state.designTasks.find((d) => d.soId === r.id)))} />,
            },
            { key: 'id', title: '单号' },
            { key: 'customer', title: '客户', render: (r) => nameOf(state.customers, r.customerId) },
            { key: 'owner', title: '负责人', render: (r) => state.designTasks.find((d) => d.soId === r.id)?.owner || '—' },
            { key: 'files', title: '附件', render: (r) => `${(state.designTasks.find((d) => d.soId === r.id)?.files || []).length} 个` },
            {
              key: 'act',
              title: '操作',
              render: (r) => {
                const des = state.designTasks.find((d) => d.soId === r.id)
                return (
                  <OpsLinks
                    items={[
                      { label: '查看', onClick: () => nav(`/design/${r.id}`) },
                      designDocStatus(des) === 'draft' && {
                        label: '删除',
                        onClick: () => ask('删除设计草稿', '草稿可直接删除，删除后不再出现在列表，并记入操作记录。已完成的请走「取消」。', () => actions.deleteDesignDraft(r.id)),
                      },
                      designDocStatus(des) === 'done' && {
                        label: bomLocked(bomStatusOf(state, r.id)) ? '查看 BOM' : '去编 BOM',
                        onClick: () => nav(bomLocked(bomStatusOf(state, r.id)) ? `/design/bom/${r.id}?mode=view` : `/design/bom/${r.id}`),
                      },
                      {
                        label: '提交异常',
                        onClick: () => ex.open({ process: '设计', soId: r.id, hint: '设计资料、交期等问题。任何阶段都能上报。', onDone: flash }),
                      },
                      designCanCancel(state, des) && {
                        label: '取消',
                        onClick: () => ask('取消设计任务', '没有下游 BOM、也没有下游其它单据才可以取消。取消后可在「已取消」里回退。', () => actions.cancelDesign(r.id)),
                      },
                      des?.closeStatus === 'closed' && {
                        label: '回退',
                        onClick: () => ask('回退设计任务', '取消只是打了作废标记，单据内容没动过；回退后回到取消前的状态。', () => actions.reopenDesign(r.id)),
                      },
                    ]}
                  />
                )
              },
            },
          ]}
          rows={slicePage(rows, page)}
        />
        <Pager total={rows.length} page={page} onChange={setPage} />
      </div>
      {newOpen && (
        <Modal
          title="新增设计任务"
          okText="确认新增"
          onCancel={() => setNewOpen(false)}
          onOk={() => {
            if (!pickId) return flash({ ok: false, message: '请选择尚未做设计任务的项目' })
            const r = actions.startDesign(pickId)
            flash(r)
            if (!r.ok) return
            setNewOpen(false)
            nav(`/design/${pickId}`)
          }}
        >
          <Field label="项目" required>
            <select value={pickId} onChange={(e) => setPickId(e.target.value)}>
              <option value="">请选择</option>
              {blank.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
          {blank.length === 0 && <p className="hint">没有可新增的项目。设计任务必须挂在已确认、且尚未做设计任务的项目下。</p>}
        </Modal>
      )}
    </Page>
  )
}

export function DesignDetail() {
  const { soId } = useParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const ex = useExReport()
  const fileRef = useRef(null)
  const [picked, setPicked] = useState([])
  const [preview, setPreview] = useState(null)
  const [doneOpen, setDoneOpen] = useState(false)
  const [doneDate, setDoneDate] = useState('')
  const [doneTime, setDoneTime] = useState('')
  useEffect(() => {
    setPreview(null)
    setPicked([])
    setDoneOpen(false)
    if (fileRef.current) fileRef.current.value = ''
  }, [soId])
  const so = state.salesOrders.find((s) => s.id === soId)
  const des = state.designTasks.find((d) => d.soId === soId)
  const cfg = reminderOf(state, 'design')
  if (!so) return <p>项目不存在</p>
  const files = des?.files || []
  const images = files.filter((f) => isImageFile(f) && fileSrc(f))
  const docs = files.filter((f) => !isImageFile(f))
  const due = so.fallDue?.design || so.plan?.design
  const kind = des?.done ? finishKind(due, des.doneAt, cfg) : ''
  const pickAt = doneDate && doneTime ? joinAt(doneDate, doneTime) : ''
  const pickKind = finishKind(due, pickAt, cfg)
  const viewBom = bomLocked(bomStatusOf(state, soId))
  const hasBom = state.boms.some((b) => b.soId === soId)

  function openDone() {
    const t = now()
    setDoneDate(datePart(t))
    setDoneTime(timePart(t))
    setDoneOpen(true)
  }

  function setNow() {
    const t = now()
    setDoneDate(datePart(t))
    setDoneTime(timePart(t))
  }

  function onPick(e) {
    const list = [...(e.target.files || [])]
    setPicked(list)
  }

  function uploadPicked() {
    if (!picked.length) return flash({ ok: false, message: '请先选好文件再上传' })
    ask('确认上传附件', `将上传 ${picked.length} 个文件到本设计任务，上传后项目上就能看到。确定继续吗？`, () => doUpload())
  }

  async function doUpload() {
    const packed = []
    for (const f of picked) {
      packed.push({
        name: f.name,
        size: fmtSize(f.size),
        type: f.type,
        dataUrl: await readAsDataUrl(f),
      })
    }
    const r = actions.addDesignFiles(soId, packed)
    flash(r)
    if (r.ok) {
      setPicked([])
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function openFile(f, mode) {
    const src = fileSrc(f)
    if (!src) return flash({ ok: false, message: '示例附件没有文件内容，请重新上传后再预览或下载' })
    if (mode === 'download') {
      const a = document.createElement('a')
      a.href = src
      a.download = f.name
      a.click()
      return
    }
    setPreview(f)
  }

  function removeFile(f) {
    ask('删除附件', `删除「${f.name}」。设计完成后须先回退才能删。`, () => actions.removeDesignFile(soId, f.name))
  }

  return (
    <Page
      crumb={<>设计管理 / 设计任务 / {so.projectName}</>}
      title={so.projectName}
      extra={<Btn onClick={() => nav('/design')}>返回列表</Btn>}
    >
      {node}
      <div className="card">
        <div className="detail-grid">
          <div className="k">项目</div><div>{so.projectName}（{so.id}）</div>
          <div className="k">客户</div><div>{nameOf(state.customers, so.customerId)}</div>
          <div className="k">设计状态</div>
          <div>{des?.done ? `已完成 ${des.doneAt}` : des ? '进行中' : '未开始'}</div>
          <div className="k">计划完成日</div><div>{due || '未设瀑布计划'}</div>
          {des?.done && (
            <>
              <div className="k">对照计划</div>
              <div>{finishKindTag(kind)}{kind === 'none' ? null : <span className="hint"> 对照首页瀑布设计节点</span>}</div>
            </>
          )}
        </div>
      </div>
      <div className="card">
        <h3>{des?.done ? '附件资料' : '上传资料'}</h3>
        {!des?.done && (
          <>
            <p className="hint">支持表格、图纸、压缩包、图片、PDF。选好文件后上传，才会出现在附件清单。</p>
            <div className="upload-box">
              <input ref={fileRef} type="file" multiple onChange={onPick} />
              <p className="hint" style={{ marginTop: 8 }}>选好文件后上传</p>
              {picked.length > 0 && <p className="hint">已选 {picked.length} 个：{picked.map((f) => f.name).join('、')}</p>}
              <Btn kind="primary" onClick={uploadPicked} disabled={!picked.length}>上传</Btn>
            </div>
          </>
        )}
        {des?.done && <p className="hint">设计已确认完成，不能再上传。若要补传或删改附件，请先回退确认完成。</p>}
        {images.length > 0 && (
          <div className="thumb-grid">
            {images.map((f, i) => (
              <div key={`${f.name}-${i}`} className="thumb-card">
                <button type="button" className="thumb-pic" onClick={() => openFile(f, 'preview')}>
                  <img src={fileSrc(f)} alt={f.name} />
                </button>
                <div className="thumb-meta">
                  <b>{f.name}</b>
                  <span>{f.size || '—'}</span>
                </div>
                <div className="row-actions">
                  <Btn onClick={() => openFile(f, 'preview')}>预览</Btn>
                  <Btn onClick={() => openFile(f, 'download')}>下载</Btn>
                  {!des?.done && <Btn onClick={() => removeFile(f)}>删除</Btn>}
                </div>
              </div>
            ))}
          </div>
        )}
        {docs.map((f, i) => (
          <div key={`${f.name}-${i}`} className="file-row">
            <b>{f.name}</b>
            <span>{f.size}</span>
            {isPdfFile(f) && <Btn onClick={() => openFile(f, 'preview')}>预览</Btn>}
            <Btn onClick={() => openFile(f, 'download')}>下载</Btn>
            {!des?.done && <Btn onClick={() => removeFile(f)}>删除</Btn>}
          </div>
        ))}
        {files.length === 0 && <p className="hint">还没有附件，不能确认完成。</p>}
        <div className="row-actions" style={{ marginTop: 16 }}>
          {!des?.done && (
            <Btn kind="primary" onClick={openDone}>确认完成</Btn>
          )}
          {des?.done && (
            <Btn onClick={() => ask(
              '回退确认完成',
              hasBom ? '已有 BOM，须先回退 BOM。' : '确定回退确认完成？',
              () => actions.rollbackDesign(soId),
            )}
            >
              回退确认完成
            </Btn>
          )}
          {des?.done && (
            <Btn kind={viewBom ? undefined : 'primary'} onClick={() => nav(viewBom ? `/design/bom/${soId}?mode=view` : `/design/bom/${soId}`)}>
              {viewBom ? '查看 BOM' : '去编 BOM'}
            </Btn>
          )}
          <Btn onClick={() => ex.open({ process: '设计', soId, hint: '设计资料、交期等问题。任何阶段都能上报。', onDone: flash })}>提交异常</Btn>
        </div>
      </div>
      {ex.node}
      {doneOpen && (
        <Modal
          title="确认完成"
          okText="确认完成"
          onCancel={() => setDoneOpen(false)}
          onOk={() => {
            const r = actions.completeDesign(soId, joinAt(doneDate, doneTime))
            flash(r)
            if (!r.ok) return
            setDoneOpen(false)
          }}
        >
          <p>这里主要是上传设计资料。选定完成时间后，会立刻对照首页瀑布的设计计划完成日。</p>
          <div className="filters">
            <Field label="日期" required>
              <input type="date" value={doneDate} onChange={(e) => setDoneDate(e.target.value)} />
            </Field>
            <Field label="时分秒" required>
              <input type="time" step="1" value={doneTime} onChange={(e) => setDoneTime(e.target.value)} />
            </Field>
          </div>
          <div className="row-actions" style={{ marginTop: 8 }}>
            <Btn onClick={setNow}>此时此刻</Btn>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            计划完成日 {due || '未设'}。按当前选择将记为：{pickAt ? (finishKindLabel(pickKind) || '请填完整时间') : '请填完整时间'}。
            到期前黄灯天数内完成是「延期完成」，超过计划完成时刻是「超期完成」，更早是「正常时间内完成」。也可以选回之前实际做完的时间。
          </p>
        </Modal>
      )}
      {preview && (
        <Modal title={preview.name} okText="关闭" wide onCancel={() => setPreview(null)} onOk={() => setPreview(null)}>
          {isImageFile(preview) && fileSrc(preview) && (
            <img className="attach-preview" src={fileSrc(preview)} alt={preview.name} />
          )}
          {isPdfFile(preview) && fileSrc(preview) && (
            <iframe className="pdf-preview" title={preview.name} src={fileSrc(preview)} />
          )}
          <div className="row-actions" style={{ marginTop: 12 }}>
            <Btn onClick={() => openFile(preview, 'download')}>下载</Btn>
          </div>
        </Modal>
      )}
    </Page>
  )
}

function emptyLine(state) {
  return { productId: '', name: '', spec: '', unit: '件', type: '项目料', per: 1, supplierId: state.suppliers[0]?.id || '', pick: true }
}

export function BomList() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const [tab, setTab] = useState('all')
  const [soId, setSoId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [page, setPage] = useState(1)
  const [importOpen, setImportOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [pickId, setPickId] = useState('')
  const cfg = reminderOf(state, 'bom')
  const projects = state.salesOrders.filter((s) => s.confirmStatus === 'confirmed')
  /** 列表以「已建的 BOM」为行，未建项目只在新增弹窗里出现 */
  const rows0 = state.boms.map((b) => state.salesOrders.find((s) => s.id === b.soId)).filter(Boolean)

  const counts = useMemo(() => ({
    all: rows0.length,
    draft: rows0.filter((s) => bomDocStatus(state, s.id) === 'draft').length,
    done: rows0.filter((s) => bomDocStatus(state, s.id) === 'done').length,
    ordered: rows0.filter((s) => bomDocStatus(state, s.id) === 'ordered').length,
    cancelled: rows0.filter((s) => bomDocStatus(state, s.id) === 'cancelled').length,
  }), [rows0, state.boms, state.purchaseOrders])

  const rows = rows0.filter((r) => {
    const k = bomDocStatus(state, r.id)
    if (tab !== 'all' && k !== tab) return false
    if (soId && r.id !== soId) return false
    if (customerId && r.customerId !== customerId) return false
    return true
  })
  const blank = projects.filter((s) => bomDocStatus(state, s.id) === 'none' && designDocStatus(state.designTasks.find((d) => d.soId === s.id)) === 'done')

  return (
    <Page crumb={<>设计管理 / BOM</>}>
      {node}
      <div className="card">
        <Tabs
          value={tab}
          onChange={(k) => { setTab(k); setPage(1) }}
          items={[
            { key: 'all', label: '全部', count: counts.all },
            { key: 'draft', label: '草稿', count: counts.draft },
            { key: 'done', label: '已完成', count: counts.done },
            { key: 'ordered', label: '已下单', count: counts.ordered },
            { key: 'cancelled', label: '已取消', count: counts.cancelled },
          ]}
        />
        <Filters onQuery={() => setPage(1)} onReset={() => { setSoId(''); setCustomerId(''); setPage(1) }}>
          <Field label="项目">
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">全部项目</option>
              {rows0.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
          <Field label="客户">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">全部</option>
              {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </Filters>
        <div className="list-toolbar">
          <Btn onClick={() => setImportOpen(true)}>Excel 导入</Btn>
          <Btn kind="primary" onClick={() => { setPickId(blank[0]?.id || ''); setNewOpen(true) }}>新增</Btn>
        </div>
        <Table
          onRow={(r) => {
            const k = bomDocStatus(state, r.id)
            nav(k === 'draft' ? `/design/bom/${r.id}` : `/design/bom/${r.id}?mode=view`)
          }}
          columns={[
            { key: 'projectName', title: '项目', link: true },
            {
              key: 'st',
              title: '单据状态',
              // 同上：不带红绿灯
              render: (r) => <DocStatus value={bomStatusLabel(bomDocStatus(state, r.id))} />,
            },
            { key: 'id', title: '单号' },
            { key: 'customer', title: '客户', render: (r) => nameOf(state.customers, r.customerId) },
            { key: 'des', title: '设计', render: (r) => designDocStatus(state.designTasks.find((d) => d.soId === r.id)) === 'done' ? '已完成' : '未完成' },
            { key: 'qty', title: '台数', render: (r) => state.boms.find((b) => b.soId === r.id)?.qty || '—' },
            {
              key: 'act',
              title: '操作',
              render: (r) => {
                const k = bomDocStatus(state, r.id)
                return (
                  <OpsLinks
                    items={[
                      { label: '查看', onClick: () => nav(`/design/bom/${r.id}?mode=view`) },
                      k === 'draft' && { label: '编辑', onClick: () => nav(`/design/bom/${r.id}`) },
                      k === 'draft' && {
                        label: '删除',
                        onClick: () => ask('删除 BOM 草稿', '只有草稿能直接删除，删除后不再出现在列表，并记入操作记录。删除后订单就能取消/重编了。', () => actions.deleteBomDraft(r.id)),
                      },
                      k === 'done' && { label: '生成采购单', onClick: () => nav(`/design/bom/${r.id}?buy=1`) },
                      bomCanCancel(state, r.id) && {
                        label: '取消',
                        onClick: () => ask('取消 BOM', '还没生成下游采购订单、没关联其它单据才能取消。取消后可在「已取消」里回退。', () => actions.cancelBom(r.id)),
                      },
                      k === 'cancelled' && { label: '回退', onClick: () => ask('回退 BOM', '取消只是打了作废标记，单据内容没动过；回退后回到取消前的状态。', () => actions.reopenBom(r.id)) },
                    ]}
                  />
                )
              },
            },
          ]}
          rows={slicePage(rows, page)}
        />
        <Pager total={rows.length} page={page} onChange={setPage} />
      </div>
      {newOpen && (
        <Modal
          title="新增 BOM"
          okText="进入编辑"
          onCancel={() => setNewOpen(false)}
          onOk={() => {
            if (!pickId) return flash({ ok: false, message: '请选择已完成设计、尚未建 BOM 的项目' })
            setNewOpen(false)
            nav(`/design/bom/${pickId}`)
          }}
        >
          <Field label="项目" required>
            <select value={pickId} onChange={(e) => setPickId(e.target.value)}>
              <option value="">请选择</option>
              {blank.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
          {blank.length === 0 && <p className="hint">没有可新增的项目。请先完成设计，或去编辑已有草稿。</p>}
        </Modal>
      )}
      {importOpen && (
        <BomImportModal
          soId=""
          allowPick
          onClose={() => setImportOpen(false)}
          onDone={(id) => { setImportOpen(false); nav(`/design/bom/${id}`) }}
          flash={flash}
          actions={actions}
          state={state}
        />
      )}
    </Page>
  )
}

function BomImportModal({ soId: given, allowPick, onClose, onDone, flash, actions, state }) {
  const fileRef = useRef(null)
  const [soId, setSoId] = useState(given || '')
  const [paste, setPaste] = useState('')
  const ready = state.salesOrders.filter((s) => s.confirmStatus === 'confirmed'
    && designDocStatus(state.designTasks.find((d) => d.soId === s.id)) === 'done'
    && ['none', 'draft'].includes(bomStatusOf(state, s.id)))

  function downloadTpl() {
    const blob = new Blob([`\ufeff${BOM_TEMPLATE}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'BOM导入模板.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function apply(rows) {
    const id = given || soId
    if (!id) return flash({ ok: false, message: '请选择项目' })
    if (!rows.length) return flash({ ok: false, message: '没有读到物料行。请用模板列：物料名称、规格、单位、商品类型、单台用量、供应商' })
    const lines = rows.map((r) => matchPumpRow(r, state))
    const bom = state.boms.find((b) => b.soId === id)
    const r = actions.saveBom(id, bom?.qty || 1, lines)
    flash(r)
    if (r.ok) onDone(id)
  }

  /** 导入前二次确认：已有 BOM 数据时，明确告知会被直接覆盖 */
  function confirmApply(rows) {
    const id = given || soId
    if (!id) return flash({ ok: false, message: '请选择项目' })
    if (!rows.length) return flash({ ok: false, message: '没有读到物料行。请用模板列：物料名称、规格、单位、商品类型、单台用量、供应商' })
    const bom = state.boms.find((b) => b.soId === id)
    const old = (bom?.lines || []).filter((l) => l.productId || l.name).length
    ask(
      '确认导入 BOM',
      old > 0
        ? `当前 BOM 已有 ${old} 行物料，导入会直接覆盖掉，原来的内容无法恢复。确定继续吗？`
        : `将导入 ${rows.length} 行物料，写成 BOM 草稿。确定继续吗？`,
      () => apply(rows),
    )
  }

  async function onFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      confirmApply(await readPumpFile(f))
    } catch (err) {
      flash({ ok: false, message: err.message || '文件读不出来。请另存为 CSV，或从 Excel 复制后粘贴。' })
    }
  }

  return (
    <>
      <Modal title="Excel 导入 BOM" onCancel={onClose} onOk={() => confirmApply(parsePumpText(paste))} okText="按粘贴内容导入">
        {allowPick && (
          <Field label="项目" required>
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">请选择</option>
              {ready.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
        )}
        <p className="hint">上传 Excel / CSV，或从表格复制后粘贴。导入会写成草稿，已确认或已下单的不能覆盖。</p>
        <div className="row-actions">
          <Btn onClick={downloadTpl}>下载模板</Btn>
          <Btn onClick={() => fileRef.current?.click()}>上传 Excel</Btn>
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" hidden onChange={onFile} />
        </div>
        <textarea className="pump-paste" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="也可从 Excel 复制整表粘贴到这里，含表头" />
      </Modal>
      {node}
    </>
  )
}

export function BomPage() {
  const { soId } = useParams()
  const [sp] = useSearchParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const so = state.salesOrders.find((s) => s.id === soId)
  const des = state.designTasks.find((d) => d.soId === soId)
  const bom = state.boms.find((b) => b.soId === soId)
  const sug = state.suggests.find((s) => s.soId === soId)
  const status = bomStatusOf(state, soId)
  const [qty, setQty] = useState(1)
  const [lines, setLines] = useState([])
  const [sugLines, setSugLines] = useState([])
  const [importOpen, setImportOpen] = useState(false)
  const [miss, setMiss] = useState(null)
  const [buyOpen, setBuyOpen] = useState(sp.get('buy') === '1')

  useEffect(() => {
    setQty(bom?.qty || 1)
    if (bom?.lines?.length) setLines(bom.lines.map((l) => ({ ...l, pick: !l.productId })))
    else if (!bom?.confirmed) setLines([emptyLine(state)])
    else setLines([])
    if (sug?.lines?.length) setSugLines(sug.lines.map((l) => ({ ...l })))
    else if (bom?.confirmed) setSugLines(snapshotSuggest(state, bom))
    else setSugLines([])
  }, [soId, bom?.id, bom?.confirmed, sug?.id, sug?.confirmed])

  useEffect(() => {
    if (sp.get('buy') === '1' && status === 'ready') setBuyOpen(true)
  }, [sp, status])

  if (!so) return <p>项目不存在</p>
  const locked = !des?.done || !!bom?.confirmed
  const materials = state.products.filter((p) => p.type !== '成品')
  const pos = state.purchaseOrders.filter((p) => p.soId === soId && isBomPo(p))

  function setLine(i, k, v) {
    const n = [...lines]
    n[i] = { ...n[i], [k]: v }
    if (k === 'productId') {
      const p = state.products.find((x) => x.id === v)
      if (p) {
        n[i].name = p.name
        n[i].spec = p.spec || ''
        n[i].unit = p.unit
        n[i].type = p.type
        n[i].pick = false
      } else {
        n[i].productId = ''
        n[i].pick = true
      }
    }
    if (k === 'name') {
      const p = materials.find((x) => x.name === String(v || '').trim())
      if (p) {
        n[i].productId = p.id
        n[i].spec = n[i].spec || p.spec || ''
        n[i].unit = p.unit
        n[i].type = p.type
        n[i].pick = false
      } else {
        n[i].productId = ''
        n[i].pick = true
      }
    }
    setLines(n)
  }

  function setSug(i, k, v) {
    const n = [...sugLines]
    n[i] = { ...n[i], [k]: v }
    if (k === 'buy') n[i].buy = !!v
    setSugLines(n)
  }

  function bindRows(rows) {
    return rows
      .filter((l) => l.productId || String(l.name || '').trim())
      .map((l) => {
        if (l.productId) return l
        const p = materials.find((x) => x.name === String(l.name || '').trim())
        if (!p) return l
        return { ...l, productId: p.id, spec: l.spec || p.spec || '', unit: p.unit, type: p.type, pick: false }
      })
  }

  function doConfirm(rows) {
    const s = actions.saveBom(soId, qty, rows)
    if (!s.ok) return s
    const c = actions.confirmBom(soId)
    if (c.ok) {
      setMiss(null)
      setSugLines(snapshotSuggest(state, { qty: Number(qty), lines: rows }))
      setBuyOpen(true)
    }
    return c
  }

  function startConfirm() {
    if (!des?.done) return flash({ ok: false, message: '设计完成后才能确认 BOM' })
    if (!(Number(qty) > 0)) return flash({ ok: false, message: '请填写台数' })
    const bound = bindRows(lines)
    if (!bound.length) return flash({ ok: false, message: '请先在表格里填写物料' })
    if (bound.some((l) => !(Number(l.per) > 0))) return flash({ ok: false, message: '请填写单台用量' })
    const missing = bound.filter((l) => !l.productId)
    if (missing.length) {
      setMiss(missing)
      return
    }
    ask('确认 BOM', '确认后锁定物料清单，并按库存生成采购建议。', () => doConfirm(bound))
  }

  function addMissing() {
    const bound = bindRows(lines)
    const picked = bound.map((l, i) => (!l.productId ? i : -1)).filter((i) => i >= 0)
    const r = actions.createProductsFromLines(soId, bound, picked)
    if (!r.ok) return flash(r)
    setLines(r.lines)
    // 建档后会继续走「确认 BOM → 生成采购建议」，这里必须再确认一次
    ask(
      '确认 BOM 并生成采购建议',
      `已把 ${picked.length} 个定制件建成商品物料。接下来会确认 BOM，并按库存生成采购建议清单。确定继续吗？`,
      () => doConfirm(r.lines),
    )
  }

  function addAfter(i) {
    const n = [...lines]
    n.splice(i + 1, 0, emptyLine(state))
    setLines(n)
  }

  function removeRow(i) {
    setLines(lines.length <= 1 ? [emptyLine(state)] : lines.filter((_, j) => j !== i))
  }

  return (
    <Page crumb={<>设计管理 / BOM / {so.projectName}</>}>
      {node}
      <FormCard
        title={`BOM · ${so.projectName}`}
        extra={
          <>
            <Btn onClick={() => nav('/design/bom')}>返回列表</Btn>
            {status !== 'none' && bomTag(status)}
            {!locked && <Btn onClick={() => setImportOpen(true)}>Excel 导入</Btn>}
            {!locked && (
              <Btn onClick={() => ask('保存 BOM', '先存成草稿。编辑完成后请点「确认」，才会按库存生成采购建议。', () => actions.saveBom(soId, qty, bindRows(lines)))}>保存</Btn>
            )}
            {!locked && des?.done && (
              <Btn kind="primary" onClick={startConfirm}>确认</Btn>
            )}
            {status === 'ready' && (
              <Btn kind="primary" onClick={() => setBuyOpen(true)}>生成采购单</Btn>
            )}
            {status === 'draft' && (
              <Btn kind="danger" onClick={() => ask('删除 BOM 草稿', '只有草稿能直接删除，删除后不再出现在列表，并记入操作记录。删除后返回列表。', () => { const r = actions.deleteBomDraft(soId); if (r.ok) nav('/design/bom'); return r })}>删除草稿</Btn>
            )}
            {(status === 'ready' || status === 'ordered') && (
              <Btn onClick={() => ask('回退 BOM', status === 'ordered' ? '须先回退本 BOM 对应的物料采购订单，才能回退 BOM。' : '回退确认后回到草稿。', () => actions.rollbackBom(soId))}>回退</Btn>
            )}
          </>
        }
      >
        <Section
          title="项目信息"
          hint={
            status === 'ordered'
              ? '已按 BOM 下过采购单。物料明细锁定，要改须先回退对应的物料采购订单，再回退 BOM。'
              : status === 'ready'
                ? 'BOM 已确认。下面按库存给出采购建议，确认后可一键生成采购订单。要改物料须先回退确认。'
                : '在表格里选档案物料或手填名称。确认时若商品资料没有该物料，会询问是否一键添加，再按库存给出采购建议。'
          }
        >
          <div className="filters">
            <Field label="项目">
              {locked ? <div>{so.projectName}（{so.id}）</div> : <input value={`${so.projectName}（${so.id}）`} disabled />}
            </Field>
            <Field label="台数" required={!locked}>
              {locked ? <div>{qty}</div> : <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />}
            </Field>
          </div>
          {!des?.done && <p className="hint">该项目尚未设计完成，不能编辑 BOM。</p>}
        </Section>
        <Section
          title="物料明细"
          hint={locked ? '只展示已确认的物料清单，不能在这里改。' : '同一表格里选物料或手填。指针移到表格上会显示加行、减行。'}
        >
          <div className="excel-wrap">
            <table className="excel">
              <thead>
                <tr>
                  <th>行</th>
                  <th>物料</th>
                  <th>规格</th>
                  <th>商品类型</th>
                  <th>单位</th>
                  <th>单台用量</th>
                  <th>总需求</th>
                  <th>当前可用</th>
                  <th>供应商</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((r, i) => {
                  const p = state.products.find((x) => x.id === r.productId)
                  const custom = !r.productId
                  if (locked) {
                    return (
                      <tr key={i}>
                        <td className="idx">{i + 1}</td>
                        <td>{p?.name || r.name || '—'}</td>
                        <td>{p?.spec || r.spec || '—'}</td>
                        <td>{p?.type || r.type || '—'}</td>
                        <td>{p?.unit || r.unit || '—'}</td>
                        <td>{r.per}</td>
                        <td>{Number(r.per || 0) * Number(qty || 0)}</td>
                        <td>{p?.stock ?? 0}</td>
                        <td>{nameOf(state.suppliers, r.supplierId) || '—'}</td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={i}>
                      <td className="idx">
                        <span className="row-n">{i + 1}</span>
                        <span className="row-ops">
                          <button type="button" className="row-op" title="加行" onClick={() => addAfter(i)}>+</button>
                          <button type="button" className="row-op" title="减行" onClick={() => removeRow(i)}>−</button>
                        </span>
                      </td>
                      <td>
                        <div className="pump-mat">
                          <input placeholder="手填物料名称" value={r.name || p?.name || ''} onChange={(e) => setLine(i, 'name', e.target.value)} />
                          <select value={r.productId || ''} onChange={(e) => setLine(i, 'productId', e.target.value)}>
                            <option value="">手填 / 选档案物料</option>
                            {materials.map((x) => (
                              <option key={x.id} value={x.id}>{x.name}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td>
                        {custom
                          ? <input value={r.spec || ''} onChange={(e) => setLine(i, 'spec', e.target.value)} />
                          : (p?.spec || r.spec || '—')}
                      </td>
                      <td>
                        {custom ? (
                          <select value={r.type || '项目料'} onChange={(e) => setLine(i, 'type', e.target.value)}>
                            <option>项目料</option>
                            <option>常备料</option>
                          </select>
                        ) : (p?.type || r.type)}
                      </td>
                      <td>
                        {custom
                          ? <input value={r.unit || '件'} onChange={(e) => setLine(i, 'unit', e.target.value)} />
                          : (p?.unit || r.unit)}
                      </td>
                      <td>
                        <input type="number" value={r.per} onChange={(e) => setLine(i, 'per', Number(e.target.value))} />
                      </td>
                      <td>{Number(r.per || 0) * Number(qty || 0)}</td>
                      <td>{custom ? '—' : (p?.stock ?? 0)}</td>
                      <td>
                        <select value={r.supplierId} onChange={(e) => setLine(i, 'supplierId', e.target.value)}>
                          {state.suppliers.filter((s) => s.status !== 'off').map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
                {lines.length === 0 && (
                  <tr><td colSpan={locked ? 9 : 10} className="hint" style={{ padding: 12 }}>{locked ? '还没有物料行。' : '还没有物料行。'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
        {status === 'ready' && (
          <Section title="采购建议" hint="对照 BOM 总需求与当前可用库存。常备料够用的默认不下。同一供应商合成一张采购订单。">
            <div className="excel-wrap">
              <table className="excel">
                <thead>
                  <tr>
                    <th>下单</th>
                    <th>物料</th>
                    <th>商品类型</th>
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
                        <select disabled={!!sug?.confirmed} value={r.supplierId} onChange={(e) => setSug(i, 'supplierId', e.target.value)}>
                          {state.suppliers.filter((s) => s.status !== 'off').map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row-actions" style={{ marginTop: 12 }}>
              <Btn onClick={() => ask('保存采购建议', '把当前勾选与数量存成草稿，离开再回来还能看到。', () => actions.saveSuggest(soId, sugLines))}>保存建议</Btn>
              <Btn kind="primary" onClick={() => ask('生成采购单', '按勾选行、按供应商生成采购订单，不跨项目。常备料够用的默认不下。', () => actions.confirmSuggest(soId, sugLines))}>按建议生成采购订单</Btn>
            </div>
          </Section>
        )}
        {status === 'ordered' && (
          <Section title="关联采购单" hint="按本 BOM 生成的物料采购订单。点查看可跳转到采购订单。">
            {pos.length === 0 && <p className="hint">还没有关联的物料采购订单。</p>}
            {pos.map((p) => (
              <div key={p.id} className="file-row">
                <b>{p.id}</b>
                <span>{nameOf(state.suppliers, p.supplierId)}</span>
                {inboundTag(p.inboundStatus)}
                <Btn onClick={() => nav(`/purchase/po/${p.id}`)}>查看</Btn>
              </div>
            ))}
          </Section>
        )}
      </FormCard>
      {importOpen && (
        <BomImportModal
          soId={soId}
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false)
            const fresh = actions
            flash({ ok: true, message: '已导入，请核对后保存。' })
            void fresh
          }}
          flash={flash}
          actions={actions}
          state={state}
        />
      )}
      {miss && (
        <Modal
          title="商品资料中没有这些物料"
          okText="一键添加到商品资料"
          onCancel={() => setMiss(null)}
          onOk={addMissing}
        >
          <p>确认 BOM 时发现以下物料不在商品基础资料中。添加后才能对照库存生成采购建议。</p>
          <ul>
            {miss.map((l, i) => (
              <li key={`${l.name}-${i}`}>{l.name}{l.spec ? `（${l.spec}）` : ''} · {l.type || '项目料'} · {l.unit || '件'}</li>
            ))}
          </ul>
        </Modal>
      )}
      {buyOpen && status === 'ready' && (
        <Modal
          wide
          title="采购建议"
          okText="按建议生成采购订单"
          onCancel={() => setBuyOpen(false)}
          onOk={() => {
            const rows = sugLines.map((l) => ({ ...l }))
            setBuyOpen(false)
            ask('生成采购单', '按勾选行、按供应商生成采购订单，不跨项目。常备料够用的默认不下。', () => actions.confirmSuggest(soId, rows))
          }}
        >
          <p>已按 BOM 对照当前库存生成采购建议。可改是否下单、采购数量和供应商。同一供应商合成一张，不跨项目。</p>
          <div className="excel-wrap">
            <table className="excel">
              <thead>
                <tr>
                  <th>下单</th>
                  <th>物料</th>
                  <th>商品类型</th>
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
                      <select disabled={!!sug?.confirmed} value={r.supplierId} onChange={(e) => setSug(i, 'supplierId', e.target.value)}>
                        {state.suppliers.filter((s) => s.status !== 'off').map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </Page>
  )
}

function snapshotSuggest(state, bom) {
  return (bom?.lines || []).map((l) => {
    const p = state.products.find((x) => x.id === l.productId)
    const need = Number(l.per || 0) * Number(bom.qty || 0)
    const stock = Number(p?.stock || 0)
    const gap = Math.max(0, need - stock)
    return {
      productId: l.productId,
      name: p?.name || l.name || '',
      type: p?.type || l.type || '',
      supplierId: l.supplierId,
      need,
      stock,
      qty: gap,
      buy: gap > 0,
    }
  })
}

function matchPumpRow(row, state) {
  const name = String(row.name || '').trim()
  const p = state.products.find((x) => x.name === name && x.type !== '成品')
  const supplier = state.suppliers.find((s) => s.name === row.supplier || (row.supplier && s.name.includes(row.supplier)))
    || state.suppliers[0]
  const type = row.type === '常备料' ? '常备料' : '项目料'
  return {
    productId: p?.id || '',
    name: p?.name || name,
    spec: row.spec || p?.spec || '',
    unit: row.unit || p?.unit || '件',
    type: p?.type || type,
    per: Number(row.per) || 1,
    supplierId: supplier?.id || '',
    pick: !p,
  }
}

function parsePumpText(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '').trim()
  if (!raw) return []
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const delim = lines[0].includes('\t') ? '\t' : ','
  const cells = lines.map((line) => splitDelim(line, delim))
  const head = cells[0].map((h) => String(h || '').trim())
  const idx = {
    name: headFind(head, ['物料名称', '名称', '物料']),
    spec: headFind(head, ['规格']),
    unit: headFind(head, ['单位']),
    type: headFind(head, ['商品类型', '类型']),
    per: headFind(head, ['单台用量', '用量']),
    supplier: headFind(head, ['供应商']),
  }
  const start = idx.name >= 0 ? 1 : 0
  const nameCol = idx.name >= 0 ? idx.name : 0
  return cells.slice(start).map((c) => ({
    name: c[nameCol],
    spec: idx.spec >= 0 ? c[idx.spec] : '',
    unit: idx.unit >= 0 ? c[idx.unit] : '件',
    type: idx.type >= 0 ? c[idx.type] : '项目料',
    per: idx.per >= 0 ? c[idx.per] : 1,
    supplier: idx.supplier >= 0 ? c[idx.supplier] : '',
  })).filter((r) => String(r.name || '').trim())
}

function headFind(head, names) {
  return head.findIndex((h) => names.some((n) => h === n || h.includes(n)))
}

function splitDelim(line, delim) {
  if (delim === '\t') return line.split('\t').map((s) => s.trim())
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i += 1 } else q = !q
    } else if (ch === ',' && !q) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

async function readPumpFile(file) {
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const rows = await readXlsxRows(file)
    return parsePumpGrid(rows)
  }
  const text = await file.text()
  return parsePumpText(text)
}

function parsePumpGrid(grid) {
  if (!grid?.length) return []
  return parsePumpText(grid.map((r) => r.join('\t')).join('\n'))
}

async function readXlsxRows(file) {
  const buf = await file.arrayBuffer()
  const files = await unzipUtf8(buf)
  const sheetName = Object.keys(files).find((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
  if (!sheetName) throw new Error('这不是可识别的 Excel 工作表。请另存为 CSV，或从表格复制粘贴。')
  const shared = parseSharedStrings(files['xl/sharedStrings.xml'] || '')
  return parseSheetXml(files[sheetName], shared)
}

function parseSharedStrings(xml) {
  const out = []
  const re = /<si[\s\S]*?<\/si>/g
  const texts = xml.match(re) || []
  texts.forEach((si) => {
    const ts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]))
    out.push(ts.join(''))
  })
  return out
}

function parseSheetXml(xml, shared) {
  const rows = []
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g
  let rm = rowRe.exec(xml)
  while (rm) {
    const line = []
    const cellRe = /<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g
    let cm = cellRe.exec(rm[1])
    while (cm) {
      const attrs = cm[1] || cm[3] || ''
      const inner = cm[2] || ''
      const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1] || ''
      const col = colIndex(ref)
      const t = (attrs.match(/t="([^"]+)"/) || [])[1]
      const v = (inner.match(/<v[^>]*>([\s\S]*?)<\/v>/) || [])[1] || ''
      let val = decodeXml(v)
      if (t === 's') val = shared[Number(v)] || ''
      if (t === 'inlineStr') val = decodeXml((inner.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '')
      line[col] = val
      cm = cellRe.exec(rm[1])
    }
    rows.push(line.map((x) => x || ''))
    rm = rowRe.exec(xml)
  }
  return rows.filter((r) => r.some((c) => String(c).trim()))
}

function colIndex(ref) {
  let n = 0
  for (let i = 0; i < ref.length; i += 1) n = n * 26 + (ref.charCodeAt(i) - 64)
  return Math.max(0, n - 1)
}

function decodeXml(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

async function unzipUtf8(buf) {
  const view = new DataView(buf)
  const u8 = new Uint8Array(buf)
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
    if (buf.byteLength - i > 65557) break
  }
  if (eocd < 0) throw new Error('Excel 读不出来。请另存为 CSV，或从表格复制粘贴。')
  const cdOff = view.getUint32(eocd + 16, true)
  const cdSize = view.getUint32(eocd + 12, true)
  const files = {}
  const dec = new TextDecoder()
  let p = cdOff
  while (p < cdOff + cdSize) {
    if (view.getUint32(p, true) !== 0x02014b50) break
    const method = view.getUint16(p + 10, true)
    const comp = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extra = view.getUint16(p + 30, true)
    const comment = view.getUint16(p + 32, true)
    const localOff = view.getUint32(p + 42, true)
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen))
    const localNameLen = view.getUint16(localOff + 26, true)
    const localExtra = view.getUint16(localOff + 28, true)
    const dataStart = localOff + 30 + localNameLen + localExtra
    const data = u8.subarray(dataStart, dataStart + comp)
    let out = data
    if (method === 8) {
      const ds = new DecompressionStream('deflate-raw')
      out = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer())
    } else if (method !== 0) {
      p += 46 + nameLen + extra + comment
      continue
    }
    files[name] = dec.decode(out)
    p += 46 + nameLen + extra + comment
  }
  return files
}
