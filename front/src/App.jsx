import { useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import Home from './pages/Home'
import { OrderList, OrderForm, OrderDetail, ReceiptList, RcvBillDetail } from './pages/Sales'
import { DesignList, DesignDetail, BomList, BomPage } from './pages/Design'
import Logs from './pages/Logs'
import {
  PoList,
  PoDetail,
  PoForm,
  PiList,
  PiForm,
  PiDetail,
  Payable,
  PayBillDetail,
  ReturnList,
  ReturnForm,
  ReturnDetail,
  ReturnOutList,
  PartForm,
} from './pages/Purchase'
import { PlanList, PlanDetail, PlanEdit } from './pages/Production'
import { OutList, OutForm, OutDetail, AbnOutList, AbnOutForm, AbnOutDetail } from './pages/Outbound'
import { InstallList, InstallDetail, TrainList, TrainDetail } from './pages/Install'
import Stock, { OtherInForm, OtherOutDetail } from './pages/Stock'
import { StockCount } from './pages/Count'
import Master, { ProductForm } from './pages/Master'
import RuleCenter from './pages/RuleCenter'
import Exception, { ExceptionDetail } from './pages/Exception'
import Pad from './pages/Pad'
import FallPlan from './pages/FallPlan'
import { exOpen, useStore } from './store'

function Ico({ d, size = 18 }) {
  return (
    <svg className="nav-ico" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z',
  sales: 'M4 7h16M4 12h16M4 17h10',
  design: 'M4 20l4.5-1.2L19 8.3a2.1 2.1 0 0 0-3-3L5.5 15.8 4 20z',
  purchase: 'M3 7h13l2 5H8m0 0-1.5 4h10.5M9 19.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  production: 'M4 20V9l6-4 6 4v11M10 20v-6h4v6',
  install: 'M14.7 6.3a1 1 0 0 1 0 1.4l-1 1 3.6 3.6 1-1a1 1 0 1 1 1.4 1.4l-7.8 7.8a2 2 0 0 1-1.4.6H6v-4.5a2 2 0 0 1 .6-1.4l7.8-7.8a1 1 0 0 1 1.4 0z',
  stock: 'M4 8l8-4 8 4v8l-8 4-8-4V8zm8 4 8-4M12 12v8M12 12 4 8',
  exception: 'M12 9v4m0 4h.01M10.3 4.3 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0z',
  logs: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  master: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2H4V7zm0 4h16v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6z',
}

const menus = [
  { to: '/', label: '首页', icon: ICONS.home, end: true },
  {
    label: '销售管理',
    icon: ICONS.sales,
    children: [
      { to: '/sales', label: '销售订单' },
      { to: '/sales/out', label: '销售出库单' },
      { to: '/sales/abn', label: '销售异常出库单' },
      { to: '/sales/receipts', label: '收款单' },
    ],
  },
  {
    label: '设计管理',
    icon: ICONS.design,
    children: [
      { to: '/design', label: '设计任务' },
      { to: '/design/bom', label: 'BOM' },
    ],
  },
  {
    label: '采购管理',
    icon: ICONS.purchase,
    children: [
      { to: '/purchase/po', label: '采购订单' },
      { to: '/purchase/pi', label: '采购入库单' },
      { to: '/purchase/return', label: '采购退货' },
      { to: '/purchase/return-out', label: '采购退货出库单' },
      { to: '/purchase/payable', label: '付款单' },
    ],
  },
  {
    label: '生产管理',
    icon: ICONS.production,
    children: [{ to: '/production', label: '生产管控' }],
  },
  {
    label: '安装调试',
    icon: ICONS.install,
    children: [
      { to: '/install', label: '安装调试' },
      { to: '/install/train', label: '培训' },
    ],
  },
  {
    label: '库存管理',
    icon: ICONS.stock,
    children: [
      { to: '/stock/query', label: '库存查询' },
      { to: '/stock/ledger', label: '库存流水' },
      { to: '/stock/other-in', label: '其他入库' },
      { to: '/stock/count', label: '盘点' },
      { to: '/stock/adjust', label: '状态调整' },
      { to: '/stock/other-out', label: '其他出库' },
    ],
  },
  { to: '/exception', label: '异常中心', icon: ICONS.exception },
  { to: '/logs', label: '操作记录', icon: ICONS.logs },
  {
    label: '基础资料',
    icon: ICONS.master,
    children: [
      { to: '/master/product', label: '商品/物料' },
      { to: '/master/customer', label: '客户档案' },
      { to: '/master/supplier', label: '供应商' },
      { to: '/master/employee', label: '员工账号' },
      { to: '/master/rule', label: '提醒策略' },
    ],
  },
]

function groupOpenByPath(pathname) {
  const hit = menus.find((m) => m.children?.some((c) => pathname.startsWith(c.to)))
  return hit?.label || ''
}

export default function App() {
  const loc = useLocation()
  const nav = useNavigate()
  const { state } = useStore()
  const pad = loc.pathname.startsWith('/pad')
  const [navOpen, setNavOpen] = useState(true)
  const [openGroups, setOpenGroups] = useState(() => {
    const g = groupOpenByPath(loc.pathname)
    return g ? { [g]: true } : { 销售管理: true }
  })
  const [notice, setNotice] = useState(false)
  const openEx = useMemo(() => state.exceptions.filter(exOpen), [state.exceptions])

  useEffect(() => {
    const g = groupOpenByPath(loc.pathname)
    if (!g) return
    setOpenGroups((prev) => (prev[g] ? prev : { ...prev, [g]: true }))
  }, [loc.pathname])

  const sidebar = (
    <aside className={`sidebar ${navOpen ? 'open' : 'closed'}`}>
      <div className="sidebar-body">
        {menus.map((m) =>
          m.children ? (
            <div key={m.label} className="nav-block">
              <button
                type="button"
                className={`nav-group ${openGroups[m.label] ? 'open' : ''} ${groupOpenByPath(loc.pathname) === m.label ? 'active' : ''}`}
                onClick={() => setOpenGroups((prev) => ({ ...prev, [m.label]: !prev[m.label] }))}
              >
                <span className="nav-group-main">
                  <Ico d={m.icon} />
                  {m.label}
                </span>
                <span className={`chev ${openGroups[m.label] ? 'down' : ''}`} />
              </button>
              {openGroups[m.label] &&
                m.children.map((c) => (
                  <NavLink
                    key={c.to}
                    to={c.to}
                    end={m.children.some((o) => o.to !== c.to && o.to.startsWith(`${c.to}/`))}
                    className={({ isActive }) => `nav-item nav-sub ${isActive ? 'active' : ''}`}
                  >
                    {c.label}
                  </NavLink>
                ))}
            </div>
          ) : (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Ico d={m.icon} />
              {m.label}
            </NavLink>
          )
        )}
      </div>
      <button type="button" className="nav-collapse" onClick={() => setNavOpen(false)}>
        <span className="nav-collapse-ico">‹</span>
        收起菜单
      </button>
    </aside>
  )

  if (pad) {
    return (
      <Routes>
        <Route path="/pad" element={<Pad />} />
      </Routes>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-btn" aria-label="打开导航菜单" onClick={() => setNavOpen((v) => !v)}>
          ☰
        </button>
        <div className="brand">
          <div className="logo">喜</div>
          <div>
            <h1>三喜机器人产销存</h1>
            <p>SANXI MES</p>
          </div>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={() => nav('/pad')}>
            员工平板
          </button>
          <button className="icon-btn" onClick={() => setNotice((v) => !v)}>
            通知
            {openEx.length > 0 && <i className="dot" />}
          </button>
          <span className="top-split" />
          <div className="avatar">维</div>
        </div>
        {notice && (
          <div className="notice-pop">
            {openEx.length === 0 && <button type="button">暂无未完结异常</button>}
            {openEx.slice(0, 6).map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setNotice(false)
                  nav(`/exception/${e.id}`)
                }}
              >
                {e.level === 'red' ? '红 · ' : '黄 · '}
                {e.title}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="shell">
        {sidebar}
        <main className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/fall/new" element={<FallPlan mode="new" />} />
            <Route path="/fall/edit" element={<FallPlan mode="edit" />} />
            <Route path="/fall/done" element={<FallPlan mode="done" />} />
            <Route path="/fall/logs" element={<FallPlan mode="logs" />} />
            <Route path="/fall/:soId" element={<FallPlan />} />
            <Route path="/sales" element={<OrderList />} />
            <Route path="/sales/new" element={<OrderForm />} />
            <Route path="/sales/out/new" element={<OutForm />} />
            <Route path="/sales/out/:id" element={<OutDetail />} />
            <Route path="/sales/out" element={<OutList />} />
            <Route path="/sales/abn/new" element={<AbnOutForm />} />
            <Route path="/sales/abn/:id" element={<AbnOutDetail />} />
            <Route path="/sales/abn" element={<AbnOutList />} />
            <Route path="/sales/receipts" element={<ReceiptList />} />
            <Route path="/sales/receipts/:id" element={<RcvBillDetail />} />
            <Route path="/sales/:id/edit" element={<OrderForm />} />
            <Route path="/sales/:id" element={<OrderDetail />} />
            <Route path="/design" element={<DesignList />} />
            <Route path="/design/bom" element={<BomList />} />
            <Route path="/design/bom/:soId" element={<BomPage />} />
            <Route path="/design/:soId" element={<DesignDetail />} />
            <Route path="/purchase/suggest" element={<Navigate to="/design/bom" replace />} />
            <Route path="/purchase/po" element={<PoList />} />
            <Route path="/purchase/po/new" element={<PoForm />} />
            <Route path="/purchase/po/:id" element={<PoDetail />} />
            <Route path="/purchase/exception" element={<Navigate to="/purchase/po?tab=wait" replace />} />
            <Route path="/purchase/transit" element={<Navigate to="/purchase/po?tab=wait" replace />} />
            <Route path="/purchase/pi" element={<PiList />} />
            <Route path="/purchase/pi/new" element={<PiForm />} />
            <Route path="/purchase/pi/:id" element={<PiDetail />} />
            <Route path="/purchase/part" element={<PartForm />} />
            <Route path="/purchase/return" element={<ReturnList />} />
            <Route path="/purchase/return/new" element={<ReturnForm />} />
            <Route path="/purchase/return/:id" element={<ReturnDetail />} />
            <Route path="/purchase/return-out" element={<ReturnOutList />} />
            <Route path="/purchase/payable" element={<Payable />} />
            <Route path="/purchase/payable/:id" element={<PayBillDetail />} />
            <Route path="/production" element={<PlanList />} />
            <Route path="/production/:id/edit" element={<PlanEdit />} />
            <Route path="/production/:id" element={<PlanDetail />} />
            <Route path="/install/train/:id" element={<TrainDetail />} />
            <Route path="/install/train" element={<TrainList />} />
            <Route path="/install" element={<InstallList />} />
            <Route path="/install/:id" element={<InstallDetail />} />
            <Route path="/stock/other-in/new" element={<OtherInForm />} />
            <Route path="/stock/other-out/:id" element={<OtherOutDetail />} />
            <Route path="/stock/count" element={<StockCount />} />
            <Route path="/stock/:tab" element={<Stock />} />
            <Route path="/master/rule" element={<RuleCenter />} />
            <Route path="/master/product/new" element={<ProductForm />} />
            <Route path="/master/product/:id" element={<ProductForm />} />
            <Route path="/master/:tab" element={<Master />} />
            <Route path="/exception" element={<Exception />} />
            <Route path="/exception/:id" element={<ExceptionDetail />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/pad" element={<Pad />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
