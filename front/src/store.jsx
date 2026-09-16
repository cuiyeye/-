import { createContext, useContext, useMemo, useSyncExternalStore } from 'react'

const listeners = new Set()
function emit() { listeners.forEach((l) => l()) }

let uidSeq = 0
/**
 * 单号生成：格式保持 PREFIX-2026-NNNN。
 * 原来是 100~999 的纯随机数，同一批一次生成十几个单据时很容易撞号
 * （实测出现过两个 EXC-2026-355），撞号会导致 React key 重复、按 id 查找拿到错误的行。
 * 改成「时间片 + 自增序号」：同一次打开页面内，同一个前缀连续 9000 个都不会重复。
 */
function uid(prefix) {
  uidSeq += 1
  const n = 1000 + (((Date.now() % 8000) * 131 + uidSeq * 137) % 9000)
  return `${prefix}-2026-${n}`
}

const demoSitePhotos = [
  { name: '现场图1.jpg', size: '86.2 KB', type: 'image/jpeg', url: import.meta.env.BASE_URL + 'demo/site-1.jpg' },
  { name: '现场图2.jpg', size: '197.5 KB', type: 'image/jpeg', url: import.meta.env.BASE_URL + 'demo/site-2.jpg' },
  { name: '现场图3.jpg', size: '122.7 KB', type: 'image/jpeg', url: import.meta.env.BASE_URL + 'demo/site-3.jpg' },
]

const seed = {
  customers: [
    { id: 'C01', name: '华南理工大学', contact: '张老师', phone: '13800001111', status: 'active' },
    { id: 'C02', name: '某师范学院', contact: '李老师', phone: '13800002222', status: 'active' },
    { id: 'C03', name: '岭南职业技术学院', contact: '陈老师', phone: '13800003333', status: 'active' },
  ],
  suppliers: [
    { id: 'S01', name: '鑫达钣金', type: '加工商', contact: '刘工', status: 'active' },
    { id: 'S02', name: '精工 CNC', type: '加工商', contact: '陈工', status: 'active' },
    { id: 'S03', name: '网购渠道', type: '网购', contact: '店主', status: 'active' },
  ],
  employees: [
    { id: 'E01', name: '维', role: '股东', pad: false },
    { id: 'E02', name: '阿强', role: '生产', pad: true },
    { id: 'E03', name: '小周', role: '生产', pad: true },
  ],
  ruleCenter: {
    version: 'v5',
    nodes: [
      { key: 'design', label: '设计', stage: '设计期', source: '里程碑计划 · 设计完成日', beforeDays: 2, people: ['E01'] },
      { key: 'bom', label: 'BOM 确认', stage: '设计期', source: '里程碑计划 · BOM 完成日', beforeDays: 2, people: ['E01'] },
      { key: 'purchaseOrder', label: '采购下单', stage: '采购期', source: '里程碑计划 · 计划下单时间', beforeDays: 3, people: ['E01'] },
      {
        key: 'supplierProducing', label: '供应商生产（未发货）', stage: '采购期', repeat: true,
        source: '采购订单 · 进入供应商生产状态', startAfterDays: 3, everyDays: 2, people: ['E01'],
      },
      { key: 'purchaseTransit', label: '到货入库（在途）', stage: '采购期', source: '采购订单 · 约定交期', beforeDays: 2, people: ['E01'] },
      { key: 'productionStep', label: '生产四步（结构/电路/机器人/装配）', stage: '生产期', source: '生产计划 · 各步骤计划完成日', beforeDays: 2, redKind: 'production', people: ['E01', 'E02'] },
      { key: 'outbound', label: '成品出库', stage: '生产期', source: '里程碑计划 · 成品出库计划日', beforeDays: 2, people: ['E01'] },
      { key: 'install', label: '安装调试', stage: '交付期', source: '里程碑计划 · 安装计划日', beforeDays: 2, people: ['E01'] },
      { key: 'train', label: '培训（=交付完成）', stage: '交付期', source: '里程碑计划 · 培训计划日', beforeDays: 2, people: ['E01'] },
      { key: 'receipt', label: '收款', stage: '资金期', source: '交付日 + 合同账期', beforeDays: 7, mode: 'after', redDays: 15, people: ['E01'] },
      { key: 'payment', label: '付款', stage: '资金期', source: '采购订单 · 预计付款日', beforeDays: 3, people: ['E01'] },
    ],
  },
  /** 安全库存的提醒对象：界面直接勾选，勾了谁就提醒谁，不做"不勾就用默认"的兜底（那样和界面显示的勾选状态对不上） */
  safetyCfg: { people: ['E01'] },
  products: [
    { id: 'M001', name: '钣金外壳', unit: '件', type: '项目料', stock: 4, repair: 0, scrap: 0, safety: 0 },
    { id: 'M002', name: 'CNC 关节', unit: '件', type: '项目料', stock: 3, repair: 1, scrap: 0, safety: 0 },
    { id: 'M003', name: '螺丝 M3', unit: '个', type: '常备料', stock: 80, repair: 0, scrap: 5, safety: 200 },
    { id: 'M004', name: '线材', unit: '卷', type: '常备料', stock: 2.2, repair: 0, scrap: 0, safety: 2, roll: true, rollInit: 1, fullRolls: 2, openRollPct: 20 },
    { id: 'FG01', name: '教学机器人（成品）', unit: '台', type: '成品', stock: 0, repair: 0, scrap: 0, safety: 0 },
    { id: 'FG02', name: '演示机器人（成品）', unit: '台', type: '成品', stock: 1, repair: 0, scrap: 0, safety: 0 },
  ],
  salesOrders: [
    {
      id: 'SO-2026-001',
      customerId: 'C01',
      projectName: '华工教学机器人项目',
      productName: '教学机器人',
      amount: 80000,
      dueDate: '2026-10-26',
      confirmStatus: 'confirmed',
      closeStatus: 'open',
      fallConfirmed: true,
      createdAt: '2026-09-01',
      planConfirmed: true,
      files: [{ name: '华工教学机合同.pdf', size: '1.2 MB', type: 'application/pdf' }],
      plan: {
        design: '2026-09-05',
        purchase: '2026-09-16',
        structure: '2026-09-18',
        circuit: '2026-09-16',
        robot: '2026-09-24',
        assemble: '2026-09-28',
        outbound: '2026-10-08',
        install: '2026-10-26',
      },
      fallDue: {
        design: '2026-09-05',
        bom: '2026-09-03',
        purchase: '2026-09-16',
        transit: '2026-09-18',
        inbound: '2026-09-16',
        structure: '2026-09-18',
        circuit: '2026-09-16',
        robot: '2026-09-24',
        assemble: '2026-09-28',
        outbound: '2026-10-14',
        install: '2026-10-26',
        train: '2026-10-26',
      },
    },
    {
      id: 'SO-2026-002',
      customerId: 'C02',
      projectName: '师范学院演示机',
      productName: '演示机器人',
      amount: 36000,
      dueDate: '2026-11-05',
      confirmStatus: 'confirmed',
      closeStatus: 'open',
      fallConfirmed: true,
      createdAt: '2026-09-12',
      fallDue: {
        design: '2026-09-20',
        bom: '2026-09-25',
        purchase: '2026-10-08',
        transit: '2026-10-12',
        inbound: '2026-10-12',
        structure: '2026-10-16',
        circuit: '2026-10-20',
        robot: '2026-10-22',
        assemble: '2026-10-26',
        outbound: '2026-10-30',
        install: '2026-11-05',
        train: '2026-11-05',
      },
    },
    {
      id: 'SO-2025-001',
      customerId: 'C01',
      projectName: '华工上学期教学机',
      productName: '教学机器人',
      amount: 72000,
      dueDate: '2026-06-18',
      confirmStatus: 'confirmed',
      closeStatus: 'open',
      fallConfirmed: true,
      createdAt: '2026-04-02',
      planConfirmed: true,
      fallDue: {
        design: '2026-04-12',
        bom: '2026-04-15',
        purchase: '2026-04-28',
        transit: '2026-05-08',
        inbound: '2026-05-08',
        structure: '2026-05-18',
        circuit: '2026-05-22',
        robot: '2026-05-28',
        assemble: '2026-06-02',
        outbound: '2026-06-08',
        install: '2026-06-12',
        train: '2026-06-18',
      },
    },
    {
      id: 'SO-2026-003',
      customerId: 'C03',
      projectName: '岭南机电实训项目',
      productName: '教学机器人',
      amount: 48000,
      dueDate: '2026-11-20',
      confirmStatus: 'confirmed',
      closeStatus: 'open',
      fallConfirmed: true,
      createdAt: '2026-09-14',
      fallDue: {
        design: '2026-09-22',
        bom: '2026-09-28',
        purchase: '2026-10-12',
        transit: '2026-10-16',
        inbound: '2026-10-16',
        structure: '2026-10-20',
        circuit: '2026-10-24',
        robot: '2026-10-28',
        assemble: '2026-11-04',
        outbound: '2026-11-12',
        install: '2026-11-20',
        train: '2026-11-20',
      },
    },
    {
      id: 'SO-2026-004',
      customerId: 'C02',
      projectName: '松苑职校柔性线',
      productName: '演示机器人',
      amount: 56000,
      dueDate: '2026-10-22',
      confirmStatus: 'confirmed',
      closeStatus: 'open',
      fallConfirmed: true,
      createdAt: '2026-08-20',
      planConfirmed: true,
      fallDue: {
        design: '2026-08-26',
        bom: '2026-08-28',
        purchase: '2026-09-05',
        transit: '2026-09-10',
        inbound: '2026-09-12',
        structure: '2026-09-16',
        circuit: '2026-09-18',
        assemble: '2026-09-24',
        outbound: '2026-10-08',
        install: '2026-10-22',
        train: '2026-10-22',
      },
    },
    {
      id: 'SO-2026-005',
      customerId: 'C03',
      projectName: '梅县实训柜体',
      productName: '教学机器人',
      amount: 36000,
      dueDate: '2026-12-10',
      confirmStatus: 'draft',
      closeStatus: 'open',
      createdAt: '2026-09-15',
    },
    {
      id: 'SO-2026-006',
      customerId: 'C01',
      projectName: '湾区技校实训产线',
      productName: '教学机器人',
      amount: 92000,
      dueDate: '2026-10-30',
      confirmStatus: 'confirmed',
      closeStatus: 'open',
      fallConfirmed: true,
      createdAt: '2026-08-05',
      planConfirmed: true,
      fallDue: {
        design: '2026-08-10',
        bom: '2026-08-12',
        purchase: '2026-08-20',
        transit: '2026-08-26',
        inbound: '2026-08-28',
        structure: '2026-09-02',
        circuit: '2026-09-06',
        robot: '2026-09-10',
        assemble: '2026-09-16',
        outbound: '2026-09-26',
        install: '2026-10-30',
        train: '2026-10-30',
      },
    },
    {
      id: 'SO-2026-007',
      customerId: 'C02',
      projectName: '南岭旧机改造(已取消)',
      productName: '演示机器人',
      amount: 24000,
      dueDate: '2026-11-08',
      confirmStatus: 'confirmed',
      closeStatus: 'closed',
      createdAt: '2026-09-02',
      fallDue: {
        design: '2026-09-10',
        bom: '2026-09-14',
        purchase: '2026-09-22',
        transit: '2026-09-26',
        inbound: '2026-09-26',
        outbound: '2026-10-20',
        install: '2026-11-08',
        train: '2026-11-08',
      },
    },
    {
      id: 'SO-2026-008',
      customerId: 'C03',
      projectName: '东莞职校装配实训台',
      productName: '演示机器人',
      amount: 64000,
      dueDate: '2026-10-18',
      confirmStatus: 'confirmed',
      closeStatus: 'open',
      fallConfirmed: true,
      createdAt: '2026-08-12',
      planConfirmed: true,
      fallDue: {
        design: '2026-08-18',
        bom: '2026-08-20',
        purchase: '2026-08-28',
        transit: '2026-09-02',
        inbound: '2026-09-04',
        structure: '2026-09-08',
        circuit: '2026-09-10',
        robot: '2026-09-12',
        assemble: '2026-09-16',
        outbound: '2026-09-28',
        install: '2026-10-18',
        train: '2026-10-18',
      },
    },
    {
      id: 'SO-2026-009',
      customerId: 'C01',
      projectName: '清远工贸实训机',
      productName: '教学机器人',
      amount: 45000,
      dueDate: '2026-12-18',
      confirmStatus: 'confirmed',
      closeStatus: 'open',
      fallConfirmed: true,
      createdAt: '2026-09-14',
      fallDue: {
        design: '2026-09-26',
        bom: '2026-10-02',
        purchase: '2026-10-16',
        transit: '2026-10-22',
        inbound: '2026-10-24',
        structure: '2026-10-30',
        circuit: '2026-11-04',
        robot: '2026-11-08',
        assemble: '2026-11-14',
        outbound: '2026-11-28',
        install: '2026-12-18',
        train: '2026-12-18',
      },
    },
  ],
  designTasks: [
    {
      id: 'DES-2026-001',
      soId: 'SO-2026-001',
      owner: '维',
      planDate: '2026-09-05',
      done: true,
      doneAt: '2026-09-04 16:20:08',
      files: [
        ...demoSitePhotos.map((f) => ({ ...f })),
        { name: '华工教学机方案.pdf', size: '18.4 MB', type: 'application/pdf', url: import.meta.env.BASE_URL + 'demo/scheme.pdf' },
        { name: '结构图纸.zip', size: '1.2 GB', type: 'application/zip', url: import.meta.env.BASE_URL + 'demo/drawings.zip' },
      ],
    },
    { id: 'DES-2026-002', soId: 'SO-2026-002', owner: '维', planDate: '2026-09-20', done: true, doneAt: '2026-09-13 10:20:00', files: [{ name: '师范学院演示机方案.pdf', size: '6.2 MB', type: 'application/pdf', url: import.meta.env.BASE_URL + 'demo/scheme.pdf' }] },
    { id: 'DES-2025-001', soId: 'SO-2025-001', owner: '维', planDate: '2026-04-12', done: true, doneAt: '2026-04-10 15:40:22', files: [{ name: '上学期方案.pdf', size: '12.1 MB', type: 'application/pdf', url: import.meta.env.BASE_URL + 'demo/scheme.pdf' }] },
    {
      id: 'DES-2026-003',
      soId: 'SO-2026-003',
      owner: '维',
      planDate: '2026-09-22',
      done: false,
      files: [
        ...demoSitePhotos.map((f) => ({ ...f })),
        { name: '岭南实训方案.pdf', size: '8.6 MB', type: 'application/pdf', url: import.meta.env.BASE_URL + 'demo/scheme.pdf' },
      ],
    },
    {
      id: 'DES-2026-004',
      soId: 'SO-2026-007',
      owner: '维',
      planDate: '2026-09-10',
      done: false,
      closeStatus: 'closed',
      cancelledAt: '2026-09-08 15:20:00',
      files: [{ name: '南岭改造初稿.pdf', size: '3.4 MB', type: 'application/pdf', url: import.meta.env.BASE_URL + 'demo/scheme.pdf' }],
    },
    {
      id: 'DES-2026-005',
      soId: 'SO-2026-008',
      owner: '维',
      planDate: '2026-08-18',
      done: true,
      doneAt: '2026-08-17 16:40:00',
      files: [{ name: '装配实训台方案.pdf', size: '5.1 MB', type: 'application/pdf', url: import.meta.env.BASE_URL + 'demo/scheme.pdf' }],
    },
  ],
  boms: [
    {
      id: 'BOM-2026-001',
      soId: 'SO-2026-001',
      confirmed: true,
      confirmedAt: '2026-09-04 17:01:22',
      qty: 2,
      lines: [
        { productId: 'M001', per: 1, supplierId: 'S01' },
        { productId: 'M002', per: 4, supplierId: 'S02' },
        { productId: 'M003', per: 40, supplierId: 'S03' },
        { productId: 'M004', per: 1, supplierId: 'S03' },
      ],
    },
    {
      id: 'BOM-2025-001',
      soId: 'SO-2025-001',
      confirmed: true,
      confirmedAt: '2026-04-14 11:20:06',
      qty: 2,
      lines: [
        { productId: 'M001', per: 1, supplierId: 'S01' },
        { productId: 'M002', per: 4, supplierId: 'S02' },
      ],
    },
    {
      id: 'BOM-2026-002',
      soId: 'SO-2026-002',
      confirmed: true,
      confirmedAt: '2026-09-13 10:40:00',
      closeStatus: 'closed',
      cancelledAt: '2026-09-14 09:05:00',
      qty: 1,
      lines: [
        { productId: 'M001', per: 1, supplierId: 'S01' },
        { productId: 'M003', per: 20, supplierId: 'S03' },
      ],
    },
    {
      id: 'BOM-2026-003',
      soId: 'SO-2026-003',
      confirmed: false,
      qty: 1,
      lines: [
        { productId: 'M001', per: 1, supplierId: 'S01' },
        { productId: 'M004', per: 2, supplierId: 'S03' },
      ],
    },
    {
      id: 'BOM-2026-004',
      soId: 'SO-2026-008',
      confirmed: true,
      confirmedAt: '2026-08-20 10:10:00',
      qty: 1,
      lines: [
        { productId: 'M001', per: 1, supplierId: 'S01' },
        { productId: 'M003', per: 20, supplierId: 'S03' },
      ],
    },
  ],
  suggests: [
    { id: 'SUG-001', soId: 'SO-2026-001', bomId: 'BOM-2026-001', confirmed: true },
  ],
  
  purchaseOrders: [
    {
      id: 'PO-2026-001',
      soId: 'SO-2026-001',
      supplierId: 'S01',
      closeStatus: 'open',
      confirmStatus: 'confirmed',
      inboundStatus: 'partial',
      settlementStatus: 'unpaid',
      shipped: true,
      address: '本厂',
      createdAt: '2026-09-04 17:10:05',
      confirmedAt: '2026-09-04 17:10:05',
      eta: '2026-09-12',
      confirmEta: '2026-09-11',
      shippedAt: '2026-09-06 09:20:00',
      fromSuggest: true,
      notes: [],
      lines: [{ productId: 'M001', qty: 2, price: 1200 }],
    },
    {
      id: 'PO-2026-002',
      soId: 'SO-2026-001',
      supplierId: 'S02',
      closeStatus: 'open',
      confirmStatus: 'confirmed',
      inboundStatus: 'none',
      settlementStatus: 'unpaid',
      shipped: false,
      address: '本厂',
      createdAt: '2026-09-04 17:10:05',
      confirmedAt: '2026-09-04 17:10:05',
      eta: '2026-09-22',
      confirmEta: '2026-09-20',
      fromSuggest: true,
      notes: [],
      lines: [{ productId: 'M002', qty: 8, price: 380 }],
    },
    {
      id: 'PO-2026-003',
      soId: '',
      supplierId: 'S03',
      closeStatus: 'open',
      confirmStatus: 'confirmed',
      inboundStatus: 'none',
      settlementStatus: 'unpaid',
      shipped: true,
      address: '本厂',
      createdAt: '2026-09-04 17:10:05',
      confirmedAt: '2026-09-04 17:10:05',
      eta: '2026-09-18',
      confirmEta: '2026-09-16',
      shippedAt: '2026-09-08 11:02:41',
      fromSuggest: true,
      notes: [],
      lines: [{ productId: 'M003', qty: 80, price: 2 }],
    },
    {
      id: 'PO-2026-004',
      soId: 'SO-2026-001',
      supplierId: 'S02',
      closeStatus: 'open',
      confirmStatus: 'confirmed',
      inboundStatus: 'none',
      settlementStatus: 'unpaid',
      shipped: false,
      address: '本厂',
      createdAt: '2026-09-10 14:20:08',
      confirmedAt: '2026-09-10 14:20:08',
      eta: '2026-09-12',
      part: true,
      notes: [],
      lines: [{ productId: 'M002', qty: 1, price: 380 }],
    },
    {
      id: 'PO-2026-005',
      soId: '',
      supplierId: 'S03',
      closeStatus: 'open',
      confirmStatus: 'confirmed',
      inboundStatus: 'none',
      settlementStatus: 'unpaid',
      shipped: true,
      address: '客户',
      createdAt: '2026-09-12 09:40:00',
      confirmedAt: '2026-09-12 09:40:00',
      eta: '2026-09-16',
      confirmEta: '2026-09-15',
      shippedAt: '2026-09-12 16:10:22',
      part: true,
      notes: [],
      lines: [{ productId: 'M003', qty: 20, price: 2 }],
    },
    {
      id: 'PO-2026-006',
      soId: 'SO-2026-001',
      supplierId: 'S02',
      closeStatus: 'open',
      confirmStatus: 'confirmed',
      inboundStatus: 'all',
      settlementStatus: 'unpaid',
      shipped: true,
      address: '本厂',
      createdAt: '2026-09-08 10:12:00',
      confirmedAt: '2026-09-08 10:12:00',
      eta: '2026-09-10',
      confirmEta: '2026-09-10',
      shippedAt: '2026-09-09 15:20:00',
      inboundDoneAt: '2026-09-13 11:20:00',
      part: true,
      notes: [],
      lines: [{ productId: 'M002', qty: 1, price: 380 }],
    },
    {
      id: 'PO-2026-007',
      soId: '',
      supplierId: 'S03',
      closeStatus: 'open',
      confirmStatus: 'confirmed',
      inboundStatus: 'all',
      settlementStatus: 'unpaid',
      shipped: true,
      address: '客户',
      createdAt: '2026-09-09 09:30:00',
      confirmedAt: '2026-09-09 09:30:00',
      eta: '2026-09-14',
      confirmEta: '2026-09-13',
      shippedAt: '2026-09-10 11:00:00',
      inboundDoneAt: '2026-09-13 16:40:00',
      part: true,
      payDue: '2026-09-18',
      notes: [],
      lines: [{ productId: 'M003', qty: 10, price: 2 }],
    },
    {
      id: 'PO-2026-008',
      soId: 'SO-2026-008',
      supplierId: 'S01',
      closeStatus: 'open',
      confirmStatus: 'confirmed',
      inboundStatus: 'all',
      settlementStatus: 'all',
      shipped: true,
      address: '本厂',
      fromSuggest: true,
      createdAt: '2026-08-26 09:00:00',
      confirmedAt: '2026-08-26 09:00:00',
      eta: '2026-09-04',
      confirmEta: '2026-09-04',
      inboundDoneAt: '2026-09-04 11:10:00',
      notes: [],
      lines: [{ productId: 'M001', qty: 1, price: 1200 }],
    },
    {
      id: 'PO-2026-009',
      soId: 'SO-2026-001',
      supplierId: 'S02',
      closeStatus: 'open',
      confirmStatus: 'confirmed',
      inboundStatus: 'partial',
      settlementStatus: 'unpaid',
      shipped: true,
      address: '本厂',
      fromSuggest: true,
      createdAt: '2026-09-11 09:15:00',
      confirmedAt: '2026-09-11 09:15:00',
      eta: '2026-09-20',
      confirmEta: '2026-09-19',
      shippedAt: '2026-09-15 10:00:00',
      notes: [],
      // 一单两料示例：项目料（CNC 关节）+ 常备料（螺丝 M3），付款按订单维度、先冲项目料
      lines: [
        { productId: 'M002', qty: 2, price: 380 },
        { productId: 'M003', qty: 100, price: 2 },
      ],
    },
    {
      id: 'PO-2025-001',
      soId: 'SO-2025-001',
      supplierId: 'S01',
      closeStatus: 'open',
      confirmStatus: 'confirmed',
      inboundStatus: 'all',
      settlementStatus: 'all',
      shipped: true,
      address: '本厂',
      createdAt: '2026-04-16 09:10:00',
      confirmedAt: '2026-04-16 09:10:00',
      eta: '2026-05-06',
      confirmEta: '2026-05-06',
      inboundDoneAt: '2026-05-06 14:22:18',
      notes: [],
      lines: [{ productId: 'M001', qty: 2, price: 1200 }],
    },
    {
      id: 'PO-2026-DRAFT',
      soId: 'SO-2026-001',
      supplierId: 'S01',
      closeStatus: 'open',
      confirmStatus: 'draft',
      inboundStatus: 'none',
      settlementStatus: 'unpaid',
      shipped: false,
      address: '本厂',
      createdAt: '2026-09-15 10:00:00',
      eta: '2026-09-25',
      notes: [],
      manual: true,
      lines: [{ productId: 'M001', qty: 1, price: 1200 }],
    },

  ],
  inboundOrders: [
    {
      id: 'PI-2026-001',
      poId: 'PO-2026-001',
      confirmed: true,
      shipped: true,
      closeStatus: 'open',
      shippedAt: '2026-09-04 17:00:00',
      createdAt: '2026-09-05 09:10:00',
      confirmedAt: '2026-09-05 09:30:12',
      remark: '第一批钣金',
      lines: [{ productId: 'M001', qty: 1 }],
    },
    {
      id: 'PI-2026-006',
      poId: 'PO-2026-006',
      confirmed: true,
      shipped: true,
      closeStatus: 'open',
      shippedAt: '2026-09-12 15:00:00',
      createdAt: '2026-09-13 11:00:00',
      confirmedAt: '2026-09-13 11:20:00',
      remark: '补件超期到厂，已入库完结',
      lines: [{ productId: 'M002', qty: 1 }],
    },
    {
      id: 'PI-2026-007',
      poId: 'PO-2026-007',
      confirmed: true,
      shipped: true,
      closeStatus: 'open',
      shippedAt: '2026-09-12 10:00:00',
      createdAt: '2026-09-13 16:20:00',
      confirmedAt: '2026-09-13 16:40:00',
      remark: '补件按期到客户地址，已签收完结',
      lines: [{ productId: 'M003', qty: 10 }],
    },
    {
      id: 'PI-2025-001',
      poId: 'PO-2025-001',
      confirmed: true,
      shipped: true,
      shippedAt: '2026-05-04 09:00:00',
      closeStatus: 'open',
      createdAt: '2026-05-06 14:00:00',
      confirmedAt: '2026-05-06 14:22:18',
      remark: '全部到齐',
      lines: [{ productId: 'M001', qty: 2 }],
    },
    {
      id: 'PI-2026-008',
      poId: 'PO-2026-002',
      confirmed: false,
      shipped: false,
      shippedAt: '',
      closeStatus: 'open',
      createdAt: '2026-09-14 15:10:00',
      confirmedAt: '',
      remark: 'CNC 关节分批到，待入库',
      lines: [{ productId: 'M002', qty: 2 }],
    },
    {
      id: 'PI-2026-009',
      poId: 'PO-2026-003',
      confirmed: false,
      shipped: false,
      shippedAt: '',
      closeStatus: 'closed',
      createdAt: '2026-09-12 09:40:00',
      cancelledAt: '2026-09-12 17:05:00',
      remark: '下单重复，取消后重开',
      lines: [{ productId: 'M003', qty: 20 }],
    },
    {
      id: 'PI-2026-010',
      poId: 'PO-2026-003',
      confirmed: false,
      shipped: true,
      shippedAt: '2026-09-13 16:00:00',
      closeStatus: 'open',
      createdAt: '2026-09-13 15:40:00',
      confirmedAt: '',
      remark: '网购直发，在途中',
      lines: [{ productId: 'M003', qty: 20 }],
    },
    {
      id: 'PI-2026-011',
      poId: 'PO-2026-008',
      confirmed: true,
      shipped: true,
      closeStatus: 'open',
      createdAt: '2026-09-03 15:00:00',
      shippedAt: '2026-09-02 10:00:00',
      confirmedAt: '2026-09-04 11:10:00',
      remark: '装配实训台钣金到厂',
      lines: [{ productId: 'M001', qty: 1 }],
    },
    {
      id: 'PI-2026-012',
      poId: 'PO-2026-009',
      confirmed: true,
      shipped: true,
      closeStatus: 'open',
      shippedAt: '2026-09-15 10:00:00',
      createdAt: '2026-09-15 16:20:00',
      confirmedAt: '2026-09-15 16:40:00',
      remark: 'CNC 关节先到 1 件，螺丝一包到齐（还差 1 件关节）',
      // 实收：项目料 1 件（下单 2 件）+ 常备料 100 个，应付只按实收算
      lines: [
        { productId: 'M002', qty: 1 },
        { productId: 'M003', qty: 100 },
      ],
    },
  ],
  productionPlans: [
    {
      id: 'PP-2026-001',
      soId: 'SO-2026-001',
      robot: true,
      done: false,
      confirmStatus: 'confirmed',
      confirmedAt: '2026-09-08 09:20:00',
      progress: 26,
      steps: [
        { name: '结构', date: '2026-09-18', target: 30, progress: 85 },
        { name: '电路', date: '2026-09-16', target: 80, progress: 20 },
        { name: '机器人', date: '2026-09-24', target: 90, progress: 0 },
        { name: '装配', date: '2026-09-28', target: 100, progress: 0 },
      ],
    },
    {
      id: 'PP-2026-002',
      soId: 'SO-2026-002',
      robot: true,
      done: false,
      confirmStatus: 'confirmed',
      confirmedAt: '2026-09-12 10:05:00',
      progress: 12,
      steps: [
        { name: '结构', date: '2026-10-16', target: 30, progress: 40 },
        { name: '电路', date: '2026-10-20', target: 80, progress: 0 },
        { name: '机器人', date: '2026-10-22', target: 90, progress: 0 },
        { name: '装配', date: '2026-10-26', target: 100, progress: 0 },
      ],
    },
    {
      id: 'PP-2026-003',
      soId: 'SO-2026-003',
      robot: true,
      done: false,
      confirmStatus: 'draft',
      progress: 0,
      steps: [
        { name: '结构', date: '2026-10-22', target: 30, progress: 0 },
        { name: '电路', date: '2026-10-27', target: 80, progress: 0 },
        { name: '机器人', date: '2026-10-28', target: 90, progress: 0 },
        { name: '装配', date: '2026-11-04', target: 100, progress: 0 },
      ],
    },
    {
      id: 'PP-2025-001',
      soId: 'SO-2025-001',
      robot: true,
      done: true,
      confirmStatus: 'confirmed',
      confirmedAt: '2026-05-14 09:00:00',
      doneAt: '2026-06-02 16:40:09',
      progress: 100,
      steps: [
        { name: '结构', date: '2026-05-18', target: 30, progress: 100, doneAt: '2026-05-16 17:12:08' },
        { name: '电路', date: '2026-05-22', target: 80, progress: 100, doneAt: '2026-05-24 18:03:41' },
        { name: '机器人', date: '2026-05-28', target: 90, progress: 100, doneAt: '2026-05-27 15:20:11' },
        { name: '装配', date: '2026-06-02', target: 100, progress: 100, doneAt: '2026-06-02 16:40:09' },
      ],
    },
    {
      id: 'PP-2026-008',
      soId: 'SO-2026-008',
      robot: true,
      done: true,
      confirmStatus: 'confirmed',
      confirmedAt: '2026-09-05 09:00:00',
      doneAt: '2026-09-16 17:20:00',
      progress: 100,
      steps: [
        { name: '结构', date: '2026-09-08', target: 30, progress: 100, doneAt: '2026-09-08 16:10:00' },
        { name: '电路', date: '2026-09-10', target: 80, progress: 100, doneAt: '2026-09-10 17:40:00' },
        { name: '机器人', date: '2026-09-12', target: 90, progress: 100, doneAt: '2026-09-12 15:05:00' },
        { name: '装配', date: '2026-09-16', target: 100, progress: 100, doneAt: '2026-09-16 17:20:00' },
      ],
    },
  ],
  outboundOrders: [
    {
      id: 'OUT-2026-001',
      soId: 'SO-2026-001',
      status: 'pending',
      signed: false,
      installed: false,
      trained: false,
      closeStatus: 'open',
      qty: 2,
      remark: '待安排物流',
      doneAt: '',
    },
    {
      id: 'OUT-2026-002',
      soId: 'SO-2026-004',
      status: 'done',
      signed: true,
      installed: true,
      trained: false,
      closeStatus: 'open',
      qty: 1,
      remark: '客户现场待培训',
      doneAt: '2026-10-08 10:20:00',
      signedAt: '2026-10-09 16:40:00',
      installedAt: '2026-10-12 11:15:00',
    },
    {
      id: 'OUT-2026-003',
      soId: 'SO-2026-006',
      status: 'done',
      signed: false,
      installed: false,
      trained: false,
      closeStatus: 'open',
      qty: 2,
      remark: '整柜发运中',
      doneAt: '2026-09-26 09:30:00',
    },
    {
      id: 'OUT-2026-004',
      soId: 'SO-2026-007',
      status: 'pending',
      signed: false,
      installed: false,
      trained: false,
      closeStatus: 'closed',
      cancelledAt: '2026-09-08 15:25:00',
      qty: 1,
      remark: '项目取消，出库单同步取消',
      doneAt: '',
    },
    {
      id: 'OUT-2025-001',
      soId: 'SO-2025-001',
      status: 'done',
      signed: true,
      installed: true,
      trained: true,
      qty: 2,
      remark: '',
      doneAt: '2026-06-08 10:15:33',
      signedAt: '2026-06-10 09:40:00',
      installedAt: '2026-06-15 16:22:18',
      trainedAt: '2026-06-18 11:05:00',
    },
  ],
  abnormals: [
    {
      id: 'SAO-2026-001',
      soId: 'SO-2026-001',
      outId: 'OUT-2026-001',
      qty: 2,
      productName: '教学机器人',
      confirmStatus: 'confirmed',
      confirmedAt: '2026-09-15 10:20:00',
      status: 'done',
      signed: false,
      closeStatus: 'open',
      at: '2026-09-15 10:20:00',
      remark: '客户急着先拉走 2 台，线材后补',
      remarks: [{ at: '2026-09-15 10:20:00', text: '客户急着先拉走 2 台，线材后补' }],
      lines: [{ productId: 'M004', name: '线材', qty: 2, note: '随下一批送' }],
    },
    {
      id: 'SAO-2026-002',
      soId: 'SO-2026-006',
      outId: 'OUT-2026-003',
      qty: 2,
      productName: '教学机器人',
      confirmStatus: 'confirmed',
      confirmedAt: '2026-09-26 09:30:00',
      status: 'done',
      signed: true,
      signedAt: '2026-09-28 15:10:00',
      closeStatus: 'open',
      at: '2026-09-26 09:30:00',
      remark: '螺丝包缺发，客户已签收确认',
      remarks: [{ at: '2026-09-26 09:30:00', text: '螺丝包缺发，客户已签收确认' }],
      lines: [{ productId: 'M003', name: '螺丝 M3', qty: 10, note: '随培训补送' }],
    },
    {
      id: 'SAO-2026-003',
      soId: 'SO-2026-003',
      outId: '',
      qty: 1,
      productName: '教学机器人',
      confirmStatus: 'draft',
      confirmedAt: '',
      status: 'pending',
      signed: false,
      closeStatus: 'open',
      at: '2026-09-16 14:00:00',
      remark: '先登记未发物料，等成品入库后再确认',
      remarks: [{ at: '2026-09-16 14:00:00', text: '先登记未发物料，等成品入库后再确认' }],
      lines: [{ productId: 'M001', name: '钣金外壳', qty: 1, note: '待补发' }],
    },
    {
      id: 'SAO-2026-004',
      soId: 'SO-2026-007',
      outId: '',
      qty: 1,
      productName: '演示机器人',
      confirmStatus: 'draft',
      confirmedAt: '',
      status: 'pending',
      signed: false,
      closeStatus: 'closed',
      cancelledAt: '2026-09-08 15:30:00',
      at: '2026-09-06 16:20:00',
      remark: '项目取消，异常出库单作废',
      remarks: [{ at: '2026-09-06 16:20:00', text: '项目取消，异常出库单作废' }],
      lines: [{ productId: 'M002', name: 'CNC 关节', qty: 1, note: '' }],
    },
  ],
  returns: [
    { id: 'RTN-2026-001', poId: 'PO-2026-001', confirmStatus: 'confirmed', closeStatus: 'open', confirmedAt: '2026-09-06 11:30:00', createdAt: '2026-09-06 11:20:00', reason: '钣金尺寸偏差', lines: [{ productId: 'M001', qty: 1 }] },
    { id: 'RTN-2026-002', poId: 'PO-2026-008', confirmStatus: 'draft', closeStatus: 'open', createdAt: '2026-09-14 14:20:00', reason: '表面划伤待确认是否退', lines: [{ productId: 'M001', qty: 1 }] },
    { id: 'RTN-2026-003', poId: 'PO-2025-001', confirmStatus: 'confirmed', closeStatus: 'open', confirmedAt: '2026-05-08 10:00:00', createdAt: '2026-05-08 09:40:00', reason: '上学期余料退回供应商', lines: [{ productId: 'M001', qty: 1 }] },
    { id: 'RTN-2026-004', poId: 'PO-2026-002', confirmStatus: 'confirmed', closeStatus: 'open', confirmedAt: '2026-09-13 16:10:00', createdAt: '2026-09-13 16:00:00', reason: 'CNC 关节公差超差', lines: [{ productId: 'M002', qty: 1 }] },
    { id: 'RTN-2026-005', poId: 'PO-2025-001', confirmStatus: 'draft', closeStatus: 'closed', createdAt: '2026-05-10 09:00:00', cancelledAt: '2026-05-11 10:20:00', reason: '与供应商协商后换货，不走退货', lines: [{ productId: 'M002', qty: 1 }] },
  ],
  returnOuts: [
    { id: 'RTO-2026-001', rtnId: 'RTN-2026-001', poId: 'PO-2026-001', status: 'pending', signed: false, closeStatus: 'open', lines: [{ productId: 'M001', qty: 1 }] },
    { id: 'RTO-2026-002', rtnId: 'RTN-2026-003', poId: 'PO-2025-001', status: 'done', signed: false, closeStatus: 'open', lines: [{ productId: 'M001', qty: 1 }] },
    { id: 'RTO-2026-003', rtnId: 'RTN-2026-004', poId: 'PO-2026-002', status: 'pending', signed: false, closeStatus: 'closed', cancelledAt: '2026-09-14 09:30:00', lines: [{ productId: 'M002', qty: 1 }] },
  ],
  /**
   * 付款单：**每个采购订单一张，由系统自动生成**（自动编号 PAY-{年}-{3位}）。
   * 单据头：单号 / 关联采购订单 / 供应商 / 业务日期 / 备注；
   * 单据体 settles = 每一次实付（日期 / 金额 / 结算方式 / 备注 / 调整±及原因）。
   * 应付合计 = 系统按实际入库数量算的应付 + Σ调整；已付 = Σ每次实付；未付 = 两者之差。
   * 这里只放「已经付过钱」的单据，其余由 ensurePayBills 自动补建。
   */
  payBills: [
    {
      id: 'PAY-2026-001',
      poId: 'PO-2026-008',
      soId: 'SO-2026-008',
      supplierId: 'S01',
      date: '2026-09-05',
      remark: '装配实训台钣金款，一次结清',
      createdAt: '2026-09-05 09:00:00',
      settles: [{ id: 'PS-2026-001', date: '2026-09-05', amount: 1200, adjust: 0, adjustReason: '', method: '转账', note: '一次结清' }],
    },
    {
      id: 'PAY-2025-001',
      poId: 'PO-2025-001',
      soId: 'SO-2025-001',
      supplierId: 'S01',
      date: '2026-05-10',
      remark: '上学期教学机钣金款',
      createdAt: '2026-05-10 10:00:00',
      settles: [{ id: 'PS-2025-001', date: '2026-05-10', amount: 2400, adjust: 0, adjustReason: '', method: '转账', note: '' }],
    },
  ],
  /**
   * 收款单：**每个销售订单一张，由系统自动生成**（自动编号 RC-{年}-{3位}）。
   * 应收合计 = 合同额 + Σ调整；已收 = Σ每次实收；未收 = 两者之差。
   */
  rcvBills: [
    {
      id: 'RC-2026-001',
      soId: 'SO-2026-001',
      customerId: 'C01',
      date: '2026-09-01',
      remark: '华工教学机合同定金',
      createdAt: '2026-09-01 10:00:00',
      settles: [{ id: 'RS-2026-001', date: '2026-09-01', amount: 10000, adjust: 0, adjustReason: '', method: '转账', note: '定金' }],
    },
    {
      id: 'RC-2025-001',
      soId: 'SO-2025-001',
      customerId: 'C01',
      date: '2026-04-02',
      remark: '上学期教学机款，已结清',
      createdAt: '2026-04-02 10:00:00',
      settles: [{ id: 'RS-2025-001', date: '2026-04-02', amount: 72000, adjust: 0, adjustReason: '', method: '转账', note: '已结清' }],
    },
    {
      id: 'RC-2026-002',
      soId: 'SO-2026-004',
      customerId: 'C02',
      date: '2026-08-20',
      remark: '松苑职校柔性线预付款',
      createdAt: '2026-08-20 10:00:00',
      settles: [{ id: 'RS-2026-002', date: '2026-08-20', amount: 30000, adjust: 0, adjustReason: '', method: '转账', note: '预付' }],
    },
    {
      id: 'RC-2026-003',
      soId: 'SO-2026-006',
      customerId: 'C02',
      date: '2026-08-05',
      remark: '湾区技校实训产线预付 50%',
      createdAt: '2026-08-05 10:00:00',
      settles: [{ id: 'RS-2026-003', date: '2026-08-05', amount: 46000, adjust: 0, adjustReason: '', method: '转账', note: '预付 50%' }],
    },
    {
      id: 'RC-2026-004',
      soId: 'SO-2026-008',
      customerId: 'C02',
      date: '2026-08-12',
      remark: '东莞职校装配实训台预付 50%',
      createdAt: '2026-08-12 10:00:00',
      settles: [{ id: 'RS-2026-004', date: '2026-08-12', amount: 32000, adjust: 0, adjustReason: '', method: '转账', note: '预付 50%' }],
    },
  ],
  exceptions: [
    { id: 'EXC-2026-001', process: '采购', title: '钣金件采购超期 2 天', content: '约定 9 月 12 日到料，至今未发货。', soId: 'SO-2026-001', poId: 'PO-2026-001', level: 'red', doneStatus: 'open', closeStatus: 'open', createdAt: '2026-09-14 08:40:00', createdBy: '系统', notes: [{ at: '2026-09-14 09:00', by: '维', text: '已电话催鑫达钣金' }] },
    { id: 'EXC-2026-002', process: '生产', title: '电路步骤明天到期', content: '对照计划完成日，总进度未达目标。', soId: 'SO-2026-001', level: 'yellow', doneStatus: 'open', closeStatus: 'open', createdAt: '2026-09-12 16:10:00', createdBy: '系统', notes: [] },
    { id: 'EXC-2026-003', process: '库存', title: '螺丝低于安全库存', content: '可用 80，下限 200。', productId: 'M003', level: 'red', doneStatus: 'open', closeStatus: 'open', createdAt: '2026-09-10 09:00:00', createdBy: '系统', notes: [] },
    { id: 'EXC-2026-004', process: '设计', title: '演示机方案未交', content: '师范学院演示机尚未提交设计资料。', soId: 'SO-2026-002', level: 'yellow', doneStatus: 'done', closeStatus: 'open', createdAt: '2026-09-12 10:00:00', createdBy: '维', notes: [{ at: '2026-09-13 10:25:00', by: '维', text: '资料已交，设计完成。' }] },
    { id: 'EXC-2026-005', process: '生产', title: '结构即将延期', content: '钣金到料晚，结构进度落后。已改排期并催料。', soId: 'SO-2026-001', level: 'yellow', doneStatus: 'done', closeStatus: 'open', createdAt: '2026-09-12 09:00:00', createdBy: '系统', notes: [{ at: '2026-09-14 10:30:00', by: '维', text: '排期已从 09-12 调到 09-18，异常完结留档。' }] },
    { id: 'EXC-2025-001', process: '生产', title: '电路超期完成', content: '计划 5 月 22 日完成电路，实际 5 月 24 日打卡 100%。', soId: 'SO-2025-001', level: 'yellow', doneStatus: 'done', closeStatus: 'open', createdAt: '2026-05-24 18:10:00', createdBy: '系统', notes: [{ at: '2026-05-24 18:20:00', by: '维', text: '已交付，异常完结留档。' }] },
    { id: 'EXC-2025-002', process: '安装', title: '现场安装晚于计划', content: '计划 6 月 12 日安装完成，实际 6 月 15 日才确认。', soId: 'SO-2025-001', level: 'yellow', doneStatus: 'done', closeStatus: 'open', createdAt: '2026-06-15 16:30:00', createdBy: '系统', notes: [{ at: '2026-06-15 16:40:00', by: '维', text: '现场插班，安装完成，异常完结。' }] },
  ],
  ledger: [
    { id: 'LED-001', at: '2026-08-01', productId: 'M003', qty: 80, dir: 'in', type: '其他入库', billId: 'OI-2026-001', remark: '期初库存' },
    { id: 'LED-004', at: '2026-08-01', productId: 'M001', qty: 3, dir: 'in', type: '其他入库', billId: 'OI-2026-001', remark: '期初库存' },
    { id: 'LED-005', at: '2026-08-01', productId: 'M002', qty: 2, dir: 'in', type: '其他入库', billId: 'OI-2026-001', remark: '期初库存' },
    { id: 'LED-006', at: '2026-08-01', productId: 'M004', qty: 2.2, dir: 'in', type: '其他入库', billId: 'OI-2026-001', remark: '期初库存（2 完整 + 1 开封剩 20%）' },
    { id: 'LED-002', at: '2026-09-05', productId: 'M001', qty: 1, dir: 'in', type: '采购入库', billId: 'PI-2026-001', remark: '第一批钣金' },
    { id: 'LED-003', at: '2026-09-13', productId: 'M002', qty: 1, dir: 'in', type: '采购入库', billId: 'PI-2026-006', remark: '补件超期到厂' },
    { id: 'LED-007', at: '2026-09-08 10:05:00', productId: 'M004', qty: 1, dir: 'out', type: '其他出库', billId: 'OTH-2026-002', remark: '送职校做演示样品' },
    { id: 'LED-008', at: '2026-09-10 14:20:00', productId: 'M003', qty: 5, dir: 'out', type: '报废出库', billId: 'OTH-2026-001', remark: '拆机时滑丝，报废' },
    { id: 'LED-009', at: '2026-09-12 16:40:00', productId: 'M003', qty: 3, dir: 'out', type: '其他出库', billId: 'OTH-2026-003', remark: '车间找不到，先按丢失出库' },
    { id: 'LED-010', at: '2026-09-12 17:10:00', productId: 'M003', qty: 3, dir: 'in', type: '其他出库回退', billId: 'OTH-2026-003', remark: '回退丢失' },
  ],
  othersIn: [
    { id: 'OI-2026-001', date: '2026-08-01', remark: '期初库存', confirmed: true, lines: [
      { productId: 'M003', qty: 80 },
      { productId: 'M001', qty: 3 },
      { productId: 'M002', qty: 2 },
      { productId: 'M004', qty: 2.2 },
    ] },
  ],
  adjusts: [],
  othersOut: [
    { id: 'OTH-2026-001', productId: 'M003', qty: 5, reason: '报废', remark: '拆机时滑丝，报废', at: '2026-09-10 14:20:00', status: 'done' },
    { id: 'OTH-2026-002', productId: 'M004', qty: 1, reason: '赠送', remark: '送职校做演示样品', at: '2026-09-08 10:05:00', status: 'done' },
    { id: 'OTH-2026-003', productId: 'M003', qty: 3, reason: '丢失', remark: '车间找不到，先按丢失出库；后来又找到了', at: '2026-09-12 16:40:00', status: 'returned', returnedAt: '2026-09-12 17:10:00' },
  ],
  counts: [
    {
      id: 'PD-2026-002',
      at: '2026-09-14',
      status: 'done',
      createdAt: '2026-09-14 09:10:00',
      gainStock: 0,
      lossStock: 1,
      gainRepair: 0,
      lossRepair: 0,
      lines: [
        { productId: 'M001', bookStock: 5, bookRepair: 0, afterStock: 5, afterRepair: 0 },
        { productId: 'M002', bookStock: 3, bookRepair: 1, afterStock: 3, afterRepair: 1 },
        { productId: 'M003', bookStock: 80, bookRepair: 0, afterStock: 79, afterRepair: 0 },
        { productId: 'M004', bookStock: 3, bookRepair: 0, afterStock: 3, afterRepair: 0 },
        { productId: 'FG01', bookStock: 0, bookRepair: 0, afterStock: 0, afterRepair: 0 },
        { productId: 'FG02', bookStock: 1, bookRepair: 0, afterStock: 1, afterRepair: 0 },
      ],
    },
    {
      id: 'PD-2026-001',
      at: '2026-09-01',
      status: 'done',
      createdAt: '2026-09-01 14:00:00',
      gainStock: 1,
      lossStock: 2,
      gainRepair: 0,
      lossRepair: 0,
      lines: [
        { productId: 'M001', bookStock: 5, bookRepair: 0, afterStock: 4, afterRepair: 0 },
        { productId: 'M002', bookStock: 3, bookRepair: 1, afterStock: 3, afterRepair: 1 },
        { productId: 'M003', bookStock: 100, bookRepair: 0, afterStock: 80, afterRepair: 0 },
        { productId: 'M004', bookStock: 3, bookRepair: 0, afterStock: 3, afterRepair: 0 },
        { productId: 'FG01', bookStock: 0, bookRepair: 0, afterStock: 0, afterRepair: 0 },
        { productId: 'FG02', bookStock: 0, bookRepair: 0, afterStock: 1, afterRepair: 0 },
      ],
    },
  ],
  punches: [
    { id: 'PK-010', soId: 'SO-2026-001', step: '结构', progress: 10, rollQty: 0, note: '领料、画线', at: '2026-09-03 16:20:11', by: '阿强' },
    { id: 'PK-009', soId: 'SO-2026-001', step: '结构', progress: 20, rollQty: 0, note: '底板组对', at: '2026-09-04 17:05:40', by: '阿强' },
    { id: 'PK-008', soId: 'SO-2026-001', step: '结构', progress: 30, rollQty: 0, note: '立柱焊接', at: '2026-09-05 16:48:02', by: '小周' },
    { id: 'PK-007', soId: 'SO-2026-001', step: '结构', progress: 40, rollQty: 0, note: '横梁校正', at: '2026-09-08 11:12:33', by: '阿强' },
    { id: 'PK-006', soId: 'SO-2026-001', step: '结构', progress: 50, rollQty: 0, note: '门框装配', at: '2026-09-09 15:30:18', by: '小周' },
    { id: 'PK-002', soId: 'SO-2026-001', step: '结构', progress: 60, rollQty: 0, note: '钣金外壳组对，点位焊接', at: '2026-09-10 09:40:16', by: '阿强' },
    { id: 'PK-005', soId: 'SO-2026-001', step: '结构', progress: 70, rollQty: 0, note: '补焊、打磨', at: '2026-09-11 14:22:09', by: '阿强' },
    { id: 'PK-001', soId: 'SO-2026-001', step: '结构', progress: 80, rollQty: 0, note: '结构基本成型', at: '2026-09-12 11:20:03', by: '小周' },
    { id: 'PK-011', soId: 'SO-2026-001', step: '结构', progress: 85, rollQty: 0, note: '调期后继续组对', at: '2026-09-14 16:30:22', by: '小周' },
    { id: 'PK-003', soId: 'SO-2026-001', step: '电路', progress: 20, rollQty: 0, note: '开始对电路板位', at: '2026-09-12 16:05:41', by: '小周' },
    { id: 'PK-110', soId: 'SO-2025-001', step: '结构', progress: 40, rollQty: 0, note: '底板组对', at: '2026-05-10 16:10:08', by: '阿强' },
    { id: 'PK-109', soId: 'SO-2025-001', step: '结构', progress: 70, rollQty: 0, note: '立柱焊接', at: '2026-05-13 15:22:40', by: '小周' },
    { id: 'PK-104', soId: 'SO-2025-001', step: '结构', progress: 100, rollQty: 0, note: '结构组对完成', at: '2026-05-16 17:12:08', by: '阿强' },
    { id: 'PK-108', soId: 'SO-2025-001', step: '电路', progress: 50, rollQty: 0, note: '对板接线', at: '2026-05-20 17:05:11', by: '小周' },
    { id: 'PK-107', soId: 'SO-2025-001', step: '电路', progress: 80, rollQty: 0, note: '柜内布线', at: '2026-05-22 16:40:09', by: '小周' },
    { id: 'PK-103', soId: 'SO-2025-001', step: '电路', progress: 100, rollQty: 0, note: '电路接线完成', at: '2026-05-24 18:03:41', by: '小周' },
    { id: 'PK-102', soId: 'SO-2025-001', step: '机器人', progress: 100, rollQty: 0, note: '示教点位完成', at: '2026-05-27 15:20:11', by: '阿强' },
    { id: 'PK-101', soId: 'SO-2025-001', step: '装配', progress: 100, rollQty: 0, note: '整机装配完成', at: '2026-06-02 16:40:09', by: '小周' },
  ],
  logs: [
    { id: 'LOG-001', at: '2026-09-01 10:00:00', title: '确认销售订单', soId: 'SO-2026-001', type: '人工操作', by: '维', module: '销售' },
    { id: 'LOG-002', at: '2026-09-01 10:12:00', title: '登记收款 ¥10,000（定金）', soId: 'SO-2026-001', type: '人工操作', by: '维', module: '收款' },
    { id: 'LOG-003', at: '2026-09-04 16:20:08', title: '设计完成', soId: 'SO-2026-001', type: '人工操作', by: '维', module: '设计' },
    { id: 'LOG-004', at: '2026-09-04 17:01:22', title: '确认 BOM', soId: 'SO-2026-001', type: '人工操作', by: '维', module: 'BOM' },
    { id: 'LOG-005', at: '2026-09-04 17:01:30', title: 'BOM 确认后按库存自动生成采购建议', soId: 'SO-2026-001', type: '系统触发', by: '系统', module: '采购' },
    { id: 'LOG-005b', at: '2026-09-04 17:10:05', title: '按 BOM 生成采购订单 PO-2026-001 / 002 / 003', soId: 'SO-2026-001', type: '人工操作', by: '维', module: '采购' },
    { id: 'LOG-006', at: '2026-09-12 16:00:00', title: '黄灯：电路计划 09-16，整单进度未达目标', soId: 'SO-2026-001', type: '系统提醒', by: '系统', module: '生产' },
    { id: 'LOG-007', at: '2026-09-14 08:40:00', title: '红灯：钣金采购约定 09-12 仍未发货', soId: 'SO-2026-001', type: '系统提醒', by: '系统', module: '采购' },
  ],
  fallAdjusts: [
    {
      id: 'FA-2026-001',
      soId: 'SO-2026-001',
      projectName: '华工教学机器人项目',
      nodeKey: 'structure',
      nodeLabel: '结构',
      from: '2026-09-12',
      to: '2026-09-18',
      reason: '钣金到料晚了，结构往后延 6 天',
      at: '2026-09-14 10:20:00',
      by: '维',
      risk: 'overdue',
    },
    {
      id: 'FA-2026-002',
      soId: 'SO-2026-001',
      projectName: '华工教学机器人项目',
      nodeKey: 'outbound',
      nodeLabel: '成品出库',
      from: '2026-10-08',
      to: '2026-10-14',
      reason: '客户同意交货延后一周，后面环节一起改',
      at: '2026-09-14 15:40:00',
      by: '维',
    },
    {
      id: 'FA-2026-003',
      soId: 'SO-2026-001',
      projectName: '华工教学机器人项目',
      nodeKey: 'install',
      nodeLabel: '安装调试',
      from: '2026-10-18',
      to: '2026-10-26',
      reason: '客户同意交货延后一周，安装调试随预计交付一起改',
      at: '2026-09-14 15:40:00',
      by: '维',
    },
    {
      id: 'FA-2026-005',
      soId: 'SO-2026-001',
      projectName: '华工教学机器人项目',
      nodeKey: 'transit',
      nodeLabel: '在途',
      from: '2026-09-16',
      to: '2026-09-18',
      reason: '供应商承诺晚两天到货，在途计划顺延',
      at: '2026-09-14 16:10:00',
      by: '维',
      risk: 'maybe',
    },
    {
      id: 'FA-2025-001',
      soId: 'SO-2025-001',
      projectName: '华工上学期教学机',
      nodeKey: 'structure',
      nodeLabel: '结构',
      from: '2026-05-12',
      to: '2026-05-18',
      reason: '钣金到料晚了，结构往后延 6 天',
      at: '2026-05-13 09:10:00',
      by: '维',
      risk: 'overdue',
    },
  ],
}

let state = structuredClone(seed)
state.products.forEach((p) => { if (p.roll) normalizeRoll(p) })

export function getState() {
  return state
}

function setState(next) {
  if (next && next.products) next.products.forEach((p) => { if (p.roll) normalizeRoll(p) })
  ensureBills(next)
  syncAutoExceptions(next)
  state = next
  emit()
}

function product(id) {
  return state.products.find((p) => p.id === id)
}

export function fgOf(st, so) {
  const fgs = (st.products || []).filter((p) => p.type === '成品' && p.status !== 'off')
  if (!so) return fgs[0] || null
  const name = String(so.productName || '').trim()
  if (!name) return null
  const strip = (s) => String(s || '').replace(/（成品）|\(成品\)/g, '').trim()
  return fgs.find((p) => p.name === name)
    || fgs.find((p) => strip(p.name) === name || p.name.includes(name) || name.includes(strip(p.name)))
    || null
}

export function fgNeedQty(st, soId) {
  return Number(st.boms.find((b) => b.soId === soId)?.qty || 1)
}

export function fgOutedQty(st, soId) {
  return st.outboundOrders
    .filter((o) => o.soId === soId && o.status === 'done')
    .reduce((s, o) => s + Number(o.qty || 0), 0)
}

function deductFgOut(next, out) {
  if (!out || out.status === 'done') return ''
  const so = next.salesOrders.find((s) => s.id === out.soId)
  const fg = fgOf(next, so)
  if (!fg) return '成品档案里没有对应成品，不能出库'
  if (Number(fg.stock || 0) < Number(out.qty || 0)) return '成品库存不足，不允许负库存出库'
  out.status = 'done'
  out.doneAt = now()
  fg.stock -= out.qty
  pushLedger(next, { productId: fg.id, qty: out.qty, dir: 'out', type: '成品出库', billId: out.id, remark: out.soId })
  return ''
}

function suggestLinesOf(st, bom) {
  return (bom?.lines || []).map((l) => {
    const p = st.products.find((x) => x.id === l.productId)
    const need = Number(l.per || 0) * Number(bom.qty || 0)
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
}

function soOf(id) {
  return state.salesOrders.find((s) => s.id === id)
}

function poOf(id) {
  return state.purchaseOrders.find((p) => p.id === id)
}

function refreshInbound(po, source) {
  const pis = source.inboundOrders.filter((x) => x.poId === po.id && x.confirmed)
  const ordered = po.lines.reduce((s, l) => s + l.qty, 0)
  const got = pis.reduce((s, pi) => s + pi.lines.reduce((a, l) => a + l.qty, 0), 0)
  po.inboundStatus = got <= 0 ? 'none' : got >= ordered ? 'all' : 'partial'
}

function qtyOnLines(rows, productId) {
  return rows.reduce((s, row) => s + (row.lines || []).filter((l) => l.productId === productId).reduce((a, l) => a + Number(l.qty || 0), 0), 0)
}

export function inboundQty(poId, productId, st = state) {
  return qtyOnLines(st.inboundOrders.filter((p) => p.poId === poId && p.confirmed), productId)
}

export function remainQty(po, productId, st = state) {
  const ordered = po.lines.find((l) => l.productId === productId)?.qty || 0
  return Math.max(0, ordered - inboundQty(po.id, productId, st))
}

function returnedQty(poId, productId, st) {
  return qtyOnLines(st.returns.filter((r) => r.poId === poId), productId)
}

/** 可退数量 = 已入库 − 已退（退货单上的数量都算已占用）；excludeRtnId 用来在改自己这张单时不算自己 */
export function returnableQty(poId, productId, st = state, excludeRtnId = '') {
  const back = qtyOnLines(st.returns.filter((r) => r.poId === poId && r.id !== excludeRtnId), productId)
  return Math.max(0, inboundQty(poId, productId, st) - back)
}

function pushLackEx(next, soId, names) {
  if (next.exceptions.some((e) => e.soId === soId && e.type === 'stock-lack' && e.doneStatus !== 'done')) return
  next.exceptions.unshift({
    id: uid('EXC'),
    process: '库存',
    title: `生产扣料后库存为负 ${soId}`,
    content: `物料 ${names.join('、')} 可用已成负数，请盘点或补货。`,
    soId,
    type: 'stock-lack',
    level: 'red',
    doneStatus: 'open',
    closeStatus: 'open',
    createdAt: now(),
    createdBy: '系统',
    notes: [],
  })
}

function hasDownstreamSO(so) {
  return (
    state.designTasks.some((d) => d.soId === so.id) ||
    state.boms.some((b) => b.soId === so.id) ||
    state.purchaseOrders.some((p) => p.soId === so.id) ||
    state.productionPlans.some((p) => p.soId === so.id) ||
    state.outboundOrders.some((o) => o.soId === so.id) ||
    state.abnormals.some((a) => a.soId === so.id) ||
    (gotOfSo(state, so.id) > 0)
  )
}

function fail(message) {
  return { ok: false, message }
}
function ok(message) {
  return { ok: true, message }
}

/** 基础资料清单名（写操作记录用） */
const MASTER_LABEL = {
  products: '商品物料',
  customers: '客户',
  suppliers: '供应商',
  employees: '员工',
}

function pushLog(next, title, extra = {}) {
  next.logs.unshift({
    id: uid('LOG'),
    at: new Date().toISOString().replace('T', ' ').slice(0, 16),
    title,
    type: extra.type || '人工操作',
    soId: extra.soId || '',
    by: extra.by || (extra.type === '系统触发' || extra.type === '系统提醒' ? '系统' : '维'),
    module: extra.module || '',
    billId: extra.billId || '',
  })
}

export function bomStatusOf(st, soId) {
  const bom = st.boms.find((b) => b.soId === soId)
  if (!bom) return 'none'
  if (bom.closeStatus === 'closed') return 'cancelled'
  if (!bom.confirmed) return 'draft'
  if (st.purchaseOrders.some((p) => p.soId === soId && isBomPo(p))) return 'ordered'
  return 'done'
}

export function bomStatusLabel(k) {
  return { none: '未建', draft: '草稿', done: '已完成', ordered: '已下单', cancelled: '已取消' }[k] || k
}

/* ==================== 单据状态口径 ====================
 * 列表 top 栏 tab 与详情页共用同一套 key，改一处即可。
 * 取消统一用 closeStatus：open 正常 / closed 已取消。
 * ==================================================== */

/** 销售出库单、销售异常出库单：待出库 / 在途 / 已签收 / 已取消 */
export function outDocStatus(o) {
  if (!o) return ''
  if (o.closeStatus === 'closed') return 'cancelled'
  if (o.status !== 'done') return 'pending'
  if (!o.signed) return 'way'
  return 'signed'
}

export function outDocStatusLabel(k) {
  return ({ pending: '待出库', way: '在途', signed: '已签收', cancelled: '已取消' })[k] || k
}

/**
 * 销售订单的「单据状态」分段 —— 段名跟「提醒策略」里的阶段一一对应。
 * 草稿 → 设计中 → 采购中 → 生产中 → 交付中 → 已交付，另加已取消。
 */
export const SO_TABS = [
  { key: 'draft', label: '草稿' },
  { key: 'designing', label: '设计中' },
  { key: 'purchasing', label: '采购中' },
  { key: 'producing', label: '生产中' },
  { key: 'delivering', label: '交付中' },
  { key: 'delivered', label: '已交付' },
  { key: 'cancelled', label: '已取消' },
]

export const SO_STAGE_LABEL = SO_TABS.reduce((a, t) => { a[t.key] = t.label; return a }, {})

/**
 * 销售订单「推进到哪一步」—— 首页瀑布、销售订单列表的「进度」列和「单据状态」列**共用这一个函数**，
 * 保证三处永远不打架。顺序 = 瀑布的规划节点顺序：
 *   设计 → BOM → 采购 → 入库 → 生产 → 成品出库 → 安装调试 → 培训
 * 自动插入的节点不参与判定：
 *   · 在途、补件采购、退货补件 —— 只影响瀑布展示和灯，不推进也不倒退单据状态；
 *   · 成品入库 —— 跟「生产确认完工」同一时刻发生，拆不成两档，并入「生产」。
 * 「单据状态」= 当前卡住的那个节点属于哪一段。
 * 返回 { key, label, step, tone }：key/label 给页签和单据状态列，step/tone 给进度列。
 */
export function soFlow(st, so) {
  if (!so) return { key: 'draft', label: SO_STAGE_LABEL.draft, step: '草稿', tone: '' }
  if (so.closeStatus === 'closed') return { key: 'cancelled', label: SO_STAGE_LABEL.cancelled, step: '已取消', tone: '' }
  if (so.confirmStatus !== 'confirmed') return { key: 'draft', label: SO_STAGE_LABEL.draft, step: '草稿', tone: '' }

  const des = (st.designTasks || []).find((d) => d.soId === so.id)
  const bom = (st.boms || []).find((b) => b.soId === so.id)
  const mainPos = (st.purchaseOrders || []).filter((p) => p.soId === so.id && !p.part)
  const arrived = mainPos.some((p) => p.inboundStatus && p.inboundStatus !== 'none')
  const inAll = mainPos.length > 0 && mainPos.every((p) => p.inboundStatus === 'all')
  const pp = (st.productionPlans || []).find((p) => p.soId === so.id)
  const out = (st.outboundOrders || []).find((o) => o.soId === so.id)
  const due = so.fallDue || so.plan || {}

  const steps = [
    { done: !!des?.done, node: '设计', seg: 'designing', due: due.design, key: 'design' },
    { done: !!bom?.confirmed, node: 'BOM', seg: 'designing', due: due.bom, key: 'bom' },
    { done: arrived, node: '采购', seg: 'purchasing', due: due.purchase, key: 'purchase' },
    { done: inAll, node: '入库', seg: 'purchasing', due: due.inbound, key: 'inbound' },
    { done: !!pp?.done, node: '生产', seg: 'producing', due: due.assemble || due.structure, key: 'production' },
    { done: out?.status === 'done', node: '成品出库', seg: 'producing', due: due.outbound, key: 'outbound' },
    { done: !!out?.installed, node: '安装调试', seg: 'delivering', due: due.install, key: 'install' },
    { done: !!out?.trained, node: '培训', seg: 'delivering', due: due.train || so.dueDate, key: 'train' },
  ]
  // 下游已经有实际完成的动作（比如货都装到现场了），说明上游必然早就做完，只是漏了点击；
  // 这种不把下游冻结在上游，否则"现场都验收了还显示设计中"。取"最后一个已完成节点"的下一步为准。
  let last = -1
  steps.forEach((s, i) => { if (s.done) last = i })
  if (last < 0) return { key: steps[0].seg, label: SO_STAGE_LABEL[steps[0].seg], step: steps[0].node, tone: delayTone(steps[0].due, reminderOf(st, steps[0].key)) }
  if (last + 1 >= steps.length) return { key: 'delivered', label: SO_STAGE_LABEL.delivered, step: '已交付', tone: '' }
  const cur = steps[last + 1]
  return { key: cur.seg, label: SO_STAGE_LABEL[cur.seg], step: cur.node, tone: delayTone(cur.due, reminderOf(st, cur.key)) }
}

/** 安装调试「单据状态」：待出库 → 在途 → 待安装 → 已完成 */
export function installStage(out) {
  if (!out || out.status !== 'done') return 'pending'
  if (!out.signed) return 'way'
  if (!out.installed) return 'ready'
  return 'done'
}

export function installStageLabel(k) {
  return ({ pending: '待出库', way: '在途', ready: '待安装', done: '已完成' })[k] || k
}

/** 培训「单据状态」：待安装 → 待培训 → 已交付 */
export function trainStage(out) {
  if (!out?.installed) return 'waitInstall'
  if (!out.trained) return 'ready'
  return 'done'
}

export function trainStageLabel(k) {
  return ({ waitInstall: '待安装', ready: '待培训', done: '已交付' })[k] || k
}

/** 没出库就能取消；已出库必须先回退出库 */
export function outCanCancel(o) {
  return !!o && o.closeStatus !== 'closed' && o.status !== 'done'
}

/** 采购入库单：待发货 / 在途 / 已入库 / 已取消。已入库回退后，回到在途 */
export function piDocStatus(pi) {
  if (!pi) return ''
  if (pi.closeStatus === 'closed') return 'cancelled'
  if (pi.confirmed) return 'done'
  return pi.shipped ? 'way' : 'wait'
}

export function piDocStatusLabel(k) {
  return ({ wait: '待发货', way: '在途', done: '已入库', cancelled: '已取消' })[k] || k
}

/** 只有没入库（待发货 / 在途）才允许取消 */
export function piCanCancel(pi) {
  return !!pi && pi.closeStatus !== 'closed' && !pi.confirmed
}

/** 网购渠道视作下单即已发货；加工类供应商要等它生产完才发 */
export function piNeedShipConfirm(st, pi) {
  if (!pi || pi.closeStatus === 'closed' || pi.confirmed || pi.shipped) return false
  const po = (st.purchaseOrders || []).find((p) => p.id === pi.poId)
  const sup = (st.suppliers || []).find((s) => s.id === po?.supplierId)
  return sup?.type !== '网购'
}

/** 采购退货单：草稿 / 已完成 / 已取消 */
export function returnDocStatus(r) {
  if (!r) return ''
  if (r.closeStatus === 'closed') return 'cancelled'
  return r.confirmStatus === 'confirmed' ? 'done' : 'draft'
}

export function returnDocStatusLabel(k) {
  return ({ draft: '草稿', done: '已完成', cancelled: '已取消' })[k] || k
}

/** 已确认会向下生成退货出库单，只有草稿能取消 */
export function returnCanCancel(r) {
  return !!r && r.closeStatus !== 'closed' && r.confirmStatus !== 'confirmed'
}

/** 采购退货出库单：待出库 / 已出库 / 已取消 */
export function returnOutDocStatus(r) {
  if (!r) return ''
  if (r.closeStatus === 'closed') return 'cancelled'
  return r.status === 'done' ? 'done' : 'pending'
}

export function returnOutDocStatusLabel(k) {
  return ({ pending: '待出库', done: '已出库', cancelled: '已取消' })[k] || k
}

/** 其他出库单状态：已出库 / 已回退（回退留档不删单，方便追溯） */
export function othersOutStatusLabel(r) {
  return r?.status === 'returned' ? '已回退' : '已出库'
}

export function returnOutCanCancel(r) {
  return !!r && r.closeStatus !== 'closed' && r.status !== 'done'
}

/** 设计任务：草稿（创建了没完成）/ 已完成 / 已取消 */
export function designDocStatus(t) {
  if (!t) return ''
  if (t.closeStatus === 'closed') return 'cancelled'
  return t.done ? 'done' : 'draft'
}

export function designDocStatusLabel(k) {
  return ({ draft: '草稿', done: '已完成', cancelled: '已取消' })[k] || k
}

/** 没有下游 BOM、也没有下游其它单据才可以取消 */
export function designCanCancel(st, t) {
  if (!t || t.closeStatus === 'closed') return false
  if ((st.boms || []).some((b) => b.soId === t.soId)) return false
  return true
}

/** BOM：草稿 / 已完成（已确认）/ 已下单（已下采购订单）/ 已取消 */
export function bomDocStatus(st, soId) {
  const bom = (st.boms || []).find((b) => b.soId === soId)
  if (!bom) return 'none'
  if (bom.closeStatus === 'closed') return 'cancelled'
  if (!bom.confirmed) return 'draft'
  if ((st.purchaseOrders || []).some((p) => p.soId === soId && isBomPo(p))) return 'ordered'
  return 'done'
}

/** 还没生成下游采购订单、没关联下游其它单据才可以取消 */
export function bomCanCancel(st, soId) {
  const bom = (st.boms || []).find((b) => b.soId === soId)
  if (!bom || bom.closeStatus === 'closed') return false
  if ((st.purchaseOrders || []).some((p) => p.soId === soId && isBomPo(p))) return false
  return true
}

/** 销售订单：对齐首页瀑布流，草稿 / 已确认 / 生产中 / 成品入库 / 已出库 / 已交付 / 已取消 */
export function soDocStatus(st, so) {
  if (!so) return ''
  if (so.closeStatus === 'closed') return 'cancelled'
  if (so.confirmStatus !== 'confirmed') return 'draft'
  const out = (st.outboundOrders || []).find((o) => o.soId === so.id)
  if (out?.status === 'done') return out.trained ? 'delivered' : 'outbound'
  const pp = (st.productionPlans || []).find((p) => p.soId === so.id)
  if (pp?.done) return 'finishedIn'
  if (pp) return 'producing'
  return 'confirmed'
}

export function soDocStatusLabel(k) {
  return ({
    draft: '草稿',
    confirmed: '已确认',
    producing: '生产中',
    finishedIn: '成品入库',
    outbound: '已出库',
    delivered: '已交付',
    cancelled: '已取消',
  })[k] || k
}

/** 生产计划口径：草稿（编辑过、没确认）/ 进行中（已确认、没完工）/ 已完工 */
export function ppDocStatus(pp) {
  if (!pp) return ''
  if (pp.done) return 'done'
  return pp.confirmStatus === 'confirmed' ? 'running' : 'draft'
}

export function ppDocStatusLabel(k) {
  return ({ draft: '草稿', running: '进行中', done: '已完成' })[k] || k
}

/** 局部生产步骤要对照的项目总计划字段 */
export const PP_STEP_DUE = { 结构: 'structure', 电路: 'circuit', 机器人: 'robot', 装配: 'assemble' }

/** 找出局部生产计划与项目总计划不一致的步骤 */
export function ppDueDiffs(st, soId, steps) {
  const so = (st.salesOrders || []).find((s) => s.id === soId)
  const due = so?.fallDue || {}
  return (steps || [])
    .filter((s) => PP_STEP_DUE[s.name] && s.date && due[PP_STEP_DUE[s.name]])
    .filter((s) => String(due[PP_STEP_DUE[s.name]] || '') !== String(s.date))
    .map((s) => ({
      name: s.name,
      key: PP_STEP_DUE[s.name],
      plan: due[PP_STEP_DUE[s.name]] || '',
      next: s.date,
    }))
}

export function isBomPo(po) {
  return !!(po?.fromSuggest || (!po?.part && !po?.safety && !po?.manual))
}

/**
 * 单据类型：跟采购订单对齐，**只有两种** —— 「采购订单」和「补件采购」。
 * （备货 / 手工新增 这些只是这张单的「来源」，看详情页的「来源」字段，不再是一种单据类型）
 */
export function poBillType(po) {
  return po?.part ? '补件采购' : '采购订单'
}

/** 单据来源（详情页展示用；不是单据类型） */
export function poSourceLabel(po) {
  if (po?.part) return '补件采购'
  if (po?.safety) return '安全库存补货'
  if (po?.manual) return '手工新增'
  return 'BOM 物料单'
}

/** 物料类型：整单全是常备料 → 常备料，否则项目料 */
export function poMatType(st, po) {
  const lines = po?.lines || []
  if (!lines.length) return '—'
  const allStock = lines.every((l) => st.products.find((p) => p.id === l.productId)?.type === '常备料')
  return allStock ? '常备料' : '项目料'
}

/**
 * 这张采购订单里出现了哪些物料类型（按订单行判断，不按已入库金额）。
 * 一张单可能两种都有 → 返回 ['项目料','常备料']，付款登记按订单维度展示整单要用到它。
 */
export function poLineKinds(st, po) {
  const s = new Set()
  ;(po?.lines || []).forEach((l) => {
    const t = st.products.find((p) => p.id === l.productId)?.type
    s.add(t === '常备料' ? '常备料' : '项目料')
  })
  return s
}

/** 展示用物料类型标签：一单两料要同时标出来（`poMatType` 是给逻辑判断用的，别混） */
export function poMatLabel(st, po) {
  const kinds = poLineKinds(st, po)
  if (!kinds.size) return '—'
  return kinds.size === 2 ? '项目料 + 常备料' : [...kinds][0]
}

/** 单据状态 key：draft / wait / partial / done / cancelled */
export function poDocStatus(po) {
  if (!po) return ''
  if (po.closeStatus === 'closed') return 'cancelled'
  if (po.confirmStatus !== 'confirmed') return 'draft'
  if (po.completeStatus === 'done') return 'complete'
  if (po.inboundStatus === 'all') return 'done'
  if (po.inboundStatus === 'partial') return 'partial'
  return 'wait'
}

export function poDocStatusLabel(k) {
  return ({ draft: '草稿', wait: '待入库', partial: '部分入库', complete: '已完结', done: '已完成', cancelled: '已取消' })[k] || k
}

/** 该采购订单还有没有未入库的单据（待发货 / 在途）。完结订单前必须为空 */
export function poPendingPIs(st, poId) {
  return st.inboundOrders.filter((p) => p.poId === poId && p.closeStatus !== 'closed' && !p.confirmed)
}

/** 草稿，或已确认但尚无任何入库单时可取消 */
export function poCanCancel(st, po) {
  if (!po || po.closeStatus === 'closed') return false
  if (po.confirmStatus !== 'confirmed') return true
  return !(st.inboundOrders || []).some((p) => p.poId === po.id)
}

/** 加工类供应商未发货时需要「确认发货」；网购不需要 */
export function poNeedShipConfirm(st, po) {
  if (!po || po.closeStatus === 'closed' || po.confirmStatus !== 'confirmed') return false
  if (po.shipped || po.inboundStatus === 'all') return false
  const sup = st.suppliers.find((s) => s.id === po.supplierId)
  return sup?.type !== '网购'
}

function pushLedger(next, row) {
  next.ledger.unshift({
    id: uid('LED'),
    at: today(),
    ...row,
  })
}

function dropLedger(next, billId) {
  next.ledger = (next.ledger || []).filter((x) => x.billId !== billId)
}

/** 卷材类物料：用 stock（卷当量）反推「完整卷数 + 开封卷剩余%」，保证两者始终一致 */
function normalizeRoll(p) {
  if (!p || !p.roll) return
  const s = Number(p.stock) || 0
  p.fullRolls = Math.floor(s)
  const frac = s - p.fullRolls
  p.openRollPct = frac > 0.001 ? Math.round(frac * 100) : null
}

function ensureFg(next, so) {
  if (fgOf(next, so)) return
  const name = String(so.productName || '').trim()
  if (!name) return
  next.products.unshift({
    id: uid('FG'),
    name: `${name}（成品）`,
    unit: '台',
    type: '成品',
    stock: 0,
    repair: 0,
    scrap: 0,
    safety: 0,
    status: 'active',
  })
}

export const actions = {
  toast: '',

  saveSO(form, asConfirm) {
    const customerId = form.customerId
    const projectName = String(form.projectName || '').trim()
    const productName = String(form.productName || '').trim()
    const amount = Number(form.amount)
    const dueDate = String(form.dueDate || '').trim()
    if (!customerId) return fail('请选择客户')
    if (!projectName) return fail('请填写项目名称')
    if (!productName) return fail('请填写成品名称')
    if (!amount || amount <= 0) return fail('请填写合同额')
    if (!dueDate) return fail('请填写预计交付日')
    const next = structuredClone(state)
    let row = form.id ? next.salesOrders.find((s) => s.id === form.id) : null
    if (!row) {
      row = { id: uid('SO'), closeStatus: 'open', confirmStatus: 'draft', createdAt: today() }
      next.salesOrders.unshift(row)
    }
    if (row.confirmStatus === 'confirmed' && !asConfirm) {
      return fail('已确认订单不可改客户、合同额、交付日，请先回退确认')
    }
    Object.assign(row, {
      customerId,
      projectName,
      productName,
      amount,
      dueDate,
      files: form.files || row.files || [],
    })
    // #20 预计交付日唯一真源：订单交付日 = 里程碑计划的培训日，哪边改都同步另一边
    if (row.fallDue && dueDate) row.fallDue = { ...row.fallDue, train: dueDate }
    if (asConfirm) {
      row.confirmStatus = 'confirmed'
      if (!row.confirmedAt) row.confirmedAt = now()
      ensureFg(next, row)
    }
    pushLog(next, asConfirm ? `确认销售订单 ${row.id}` : `保存销售订单草稿 ${row.id}`, { soId: row.id, module: '销售' })
    setState(next)
    return { ...ok(asConfirm ? '已确认，形成正式销售订单' : '草稿已保存'), id: row.id }
  },

  confirmSO(id) {
    const next = structuredClone(state)
    const so = next.salesOrders.find((s) => s.id === id)
    if (!so) return fail('订单不存在')
    if (so.closeStatus === 'closed') return fail('已取消订单不能确认')
    if (!String(so.projectName || '').trim() || !String(so.productName || '').trim() || !Number(so.amount) || !so.dueDate) {
      return fail('请先补全项目、成品名称、合同额和预计交付日')
    }
    so.confirmStatus = 'confirmed'
    if (!so.confirmedAt) so.confirmedAt = now()
    ensureFg(next, so)
    pushLog(next, `确认销售订单 ${id}`, { soId: id, module: '销售' })
    setState(next)
    return ok('销售订单已确认')
  },

  rollbackSO(id) {
    const next = structuredClone(state)
    const so = next.salesOrders.find((s) => s.id === id)
    if (!so) return fail('订单不存在')
    if (hasDownstreamSO(so)) return fail('存在下游单据，须先回退设计 / BOM / 采购 / 生产 / 出库 / 收款')
    so.confirmStatus = 'draft'
    so.confirmedAt = ''
    pushLog(next, `回退销售订单确认 ${id}`, { soId: id, module: '销售' })
    setState(next)
    return ok('已回退为草稿')
  },

  closeSO(id) {
    const next = structuredClone(state)
    const so = next.salesOrders.find((s) => s.id === id)
    if (!so) return fail('订单不存在')
    if (so.closeStatus === 'closed') return fail('订单已是已取消')
    if (so.confirmStatus !== 'draft' && so.confirmStatus !== 'confirmed') return fail('仅草稿或已确认可取消')
    if (next.boms.some((b) => b.soId === id)) return fail('本项目已有一份 BOM（含草稿），请先在设计管理里删除这份 BOM 草稿，再取消订单')
    if (next.purchaseOrders.some((p) => p.soId === id)) return fail('已有采购订单，不可取消')
    so.closeStatus = 'closed'
    so.cancelledAt = now()
    pushLog(next, `取消销售订单 ${id}`, { soId: id, module: '销售' })
    setState(next)
    return ok('订单已取消')
  },

  reopenSO(id) {
    const next = structuredClone(state)
    const so = next.salesOrders.find((s) => s.id === id)
    so.closeStatus = 'open'
    so.cancelledAt = ''
    pushLog(next, `回退销售订单（撤销取消）${id}`, { soId: id, module: '销售' })
    setState(next)
    return ok('已回退，回到取消前的状态')
  },

  deleteSO(id) {
    const next = structuredClone(state)
    const so = next.salesOrders.find((s) => s.id === id)
    if (so.confirmStatus !== 'draft') return fail('仅草稿可删除')
    if (hasDownstreamSO(so)) return fail('已有下游或收款，不能删除')
    next.salesOrders = next.salesOrders.filter((s) => s.id !== id)
    pushLog(next, `删除销售订单草稿 ${id}（${so.projectName || ''}）`, { soId: id, module: '销售' })
    setState(next)
    return ok('草稿已删除，不再出现在列表；删除已记入操作记录')
  },

  createSalesOut(soId) {
    const next = structuredClone(state)
    const so = next.salesOrders.find((s) => s.id === soId)
    if (!so) return fail('项目不存在')
    if (so.confirmStatus !== 'confirmed') return fail('请先确认销售订单')
    if (so.closeStatus === 'closed') return fail('订单已取消')
    if (next.outboundOrders.some((o) => o.soId === soId)) return fail('已有销售出库单')
    const outQty = fgNeedQty(next, soId)
    if (outQty <= 0) return fail('项目台数无效，请先建 BOM')
    const fg = fgOf(next, so)
    if (!fg) return fail('成品档案里没有这个成品，不能出库')
    if (Number(fg.stock || 0) < outQty) return fail('成品库存不足，不允许负库存出库')
    const row = {
      id: uid('OUT'),
      soId,
      status: 'pending',
      signed: false,
      installed: false,
      trained: false,
      qty: outQty,
      remark: '销售订单创建',
    }
    next.outboundOrders.unshift(row)
    pushLog(next, `创建销售出库单 ${row.id}`, { soId, module: '出库', billId: row.id })
    setState(next)
    return { ok: true, message: `已创建出库单 ${row.id}，${so.productName} ${outQty} 台待出库（= 项目台数）。确认出库时视作成品全部出库。`, id: row.id }
  },

  /** 兼容旧入口：按销售订单登记一笔收款 → 落到该订单的收款单上 */
  addReceipt(soId, rec) {
    const bill = rcvBillOf(state, soId)
    if (!bill) return fail('该销售订单还没有收款单')
    return actions.rcvBillSettle(bill.id, rec)
  },

  /** 兼容旧入口：按销售订单回退某笔收款 */
  rollbackReceipt(soId, recId) {
    const bill = rcvBillOf(state, soId)
    if (!bill) return fail('该销售订单还没有收款单')
    return actions.rollbackRcvSettle(bill.id, recId)
  },

  startDesign(soId) {
    const next = structuredClone(state)
    const so = next.salesOrders.find((s) => s.id === soId)
    if (!so) return fail('请选择要挂靠的项目')
    if (so.confirmStatus !== 'confirmed') return fail('请先确认销售订单')
    if (so.closeStatus === 'closed') return fail('项目已取消，不能新增设计任务')
    if (next.designTasks.some((d) => d.soId === soId)) return fail('该项目已有设计任务，不能重复新增')
    next.designTasks.push({ id: uid('DES'), soId, owner: '维', planDate: today(), done: false, files: [] })
    pushLog(next, '新增设计任务', { soId, module: '设计' })
    setState(next)
    return ok('已新增设计任务')
  },

  cancelDesign(soId) {
    const next = structuredClone(state)
    const task = next.designTasks.find((d) => d.soId === soId)
    if (!task) return fail('没有设计任务')
    if (task.closeStatus === 'closed') return fail('已经取消')
    if (!designCanCancel(next, task)) return fail('已有下游 BOM 或其它关联单据，不能取消')
    task.closeStatus = 'closed'
    task.cancelledAt = now()
    pushLog(next, `取消设计任务 ${task.id}`, { soId, module: '设计' })
    setState(next)
    return ok('设计任务已取消')
  },

  /** 设计任务草稿：直接删除，不写操作记录 */
  deleteDesignDraft(soId) {
    const next = structuredClone(state)
    const task = next.designTasks.find((d) => d.soId === soId)
    if (!task) return fail('没有设计任务')
    if (task.done) return fail('设计已完成，请走「取消」，不能直接删除')
    if (next.boms.some((b) => b.soId === soId)) return fail('已建 BOM，请先删除 BOM 草稿')
    next.designTasks = next.designTasks.filter((d) => d.id !== task.id)
    pushLog(next, `删除设计任务草稿 ${task.id}`, { soId, module: '设计' })
    setState(next)
    return ok('设计草稿已删除，不再出现在列表；删除已记入操作记录')
  },

  reopenDesign(soId) {
    const next = structuredClone(state)
    const task = next.designTasks.find((d) => d.soId === soId)
    if (!task) return fail('没有设计任务')
    if (task.closeStatus !== 'closed') return fail('不是已取消状态')
    task.closeStatus = 'open'
    task.cancelledAt = ''
    pushLog(next, `回退设计任务（撤销取消）${task.id}`, { soId, module: '设计' })
    setState(next)
    return ok('已回退，回到取消前的状态')
  },

  completeDesign(soId, doneAt) {
    const next = structuredClone(state)
    const so = next.salesOrders.find((s) => s.id === soId)
    if (!so) return fail('项目不存在')
    if (so.confirmStatus !== 'confirmed') return fail('请先确认销售订单')
    const task = next.designTasks.find((d) => d.soId === soId)
    if (!task) return fail('请先新增设计任务')
    if (task.closeStatus === 'closed') return fail('设计任务已取消，请先回退')
    if (task.done) return fail('设计已确认完成')
    if (!(task.files || []).length) return fail('请先上传设计资料，再确认完成')
    const t = String(doneAt || '').trim().replace('T', ' ')
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t)) return fail('完成时间请精确到年月日时分秒')
    if (stamp(t) > stamp(now())) return fail('完成时间不能晚于此时此刻')
    task.done = true
    task.doneAt = t
    const due = so.fallDue?.design || so.plan?.design
    const kind = finishKind(due, t, reminderOf(next, 'design'))
    const label = finishKindLabel(kind)
    pushLog(next, `确认完成设计 ${t}`, { soId, module: '设计' })
    setState(next)
    return ok(label ? `设计已确认完成，对照计划：${label}` : '设计已确认完成，可以编 BOM')
  },

  addDesignFiles(soId, files) {
    if (!(files || []).length) return fail('请先选好文件再上传')
    const next = structuredClone(state)
    let task = next.designTasks.find((d) => d.soId === soId)
    if (!task) {
      task = { id: uid('DES'), soId, owner: '维', planDate: today(), done: false, files: [] }
      next.designTasks.push(task)
    }
    if (task.done) return fail('设计已确认完成，须先回退才能再上传')
    task.files = task.files || []
    ;[...files].reverse().forEach((file) => {
      task.files.unshift({
        name: file.name,
        size: file.size || '—',
        type: file.type || '',
        dataUrl: file.dataUrl || '',
        url: file.url || '',
      })
    })
    pushLog(next, `上传设计资料 ${files.length} 个`, { soId, module: '设计' })
    setState(next)
    return ok(`已上传 ${files.length} 个附件`)
  },

  addDesignFile(soId, file) {
    return actions.addDesignFiles(soId, [file])
  },

  removeDesignFile(soId, name) {
    const next = structuredClone(state)
    const task = next.designTasks.find((d) => d.soId === soId)
    if (!task) return fail('没有设计任务')
    if (task.done) return fail('设计已完成，须先回退设计完成才能删附件')
    task.files = (task.files || []).filter((f) => f.name !== name)
    pushLog(next, `删除设计资料 ${name}`, { soId, module: '设计' })
    setState(next)
    return ok('附件已删除')
  },

  rollbackDesign(soId) {
    const next = structuredClone(state)
    if (next.boms.some((b) => b.soId === soId)) return fail('已有 BOM，须先回退 BOM')
    const task = next.designTasks.find((d) => d.soId === soId)
    if (task) {
      task.done = false
      task.doneAt = ''
    }
    pushLog(next, '回退设计完成', { soId, module: '设计' })
    setState(next)
    return ok('已回退设计完成')
  },

  saveBom(soId, qty, lines) {
    const next = structuredClone(state)
    const soRow = next.salesOrders.find((s) => s.id === soId)
    if (soRow?.closeStatus === 'closed') return fail('销售订单已取消，不能再编 BOM')
    const des = next.designTasks.find((d) => d.soId === soId)
    if (!des?.done) return fail('设计完成后才能编 BOM')
    if (!(Number(qty) > 0)) return fail('请填写台数')
    if (!(lines || []).length) return fail('请至少加一行物料')
    let bom = next.boms.find((b) => b.soId === soId)
    if (!bom) {
      bom = { id: uid('BOM'), soId, confirmed: false, lines: [] }
      next.boms.push(bom)
    }
    if (bom.confirmed) return fail('BOM 已确认，关键字段锁定')
    bom.qty = Number(qty)
    bom.lines = lines
    pushLog(next, `保存 BOM 草稿 ${bom.id}`, { soId, module: 'BOM' })
    setState(next)
    return ok('BOM 已保存')
  },

  createProductsFromLines(soId, lines, picked) {
    const next = structuredClone(state)
    const des = next.designTasks.find((d) => d.soId === soId)
    if (!des?.done) return fail('设计完成后才能编 BOM')
    const bom = next.boms.find((b) => b.soId === soId)
    if (bom?.confirmed) return fail('BOM 已确认，不能再建档')
    const idx = new Set(picked || [])
    let n = 0
    const patched = (lines || []).map((l, i) => {
      if (!idx.has(i) || l.productId) return l
      const name = String(l.name || '').trim()
      if (!name) return l
      const exist = next.products.find((p) => p.name === name && p.type !== '成品')
      if (exist) {
        n += 1
        return { ...l, productId: exist.id, type: exist.type, unit: exist.unit, spec: exist.spec || l.spec || '' }
      }
      const row = {
        id: uid('M'),
        name,
        spec: l.spec || '',
        unit: l.unit || '件',
        type: l.type === '常备料' ? '常备料' : '项目料',
        stock: 0,
        repair: 0,
        scrap: 0,
        safety: 0,
        status: 'active',
      }
      next.products.unshift(row)
      n += 1
      return { ...l, productId: row.id, type: row.type, unit: row.unit }
    })
    if (!n) return fail('请勾选还没有建档的定制件')
    if (bom?.closeStatus === 'closed') return fail('BOM 已取消，请先回退')
    if (bom && !bom.confirmed) bom.lines = patched
    pushLog(next, `BOM 行建成商品物料 ${n} 条`, { soId, module: 'BOM' })
    setState(next)
    return { ok: true, message: `已写入基础资料 ${n} 条，BOM 行已带上商品`, lines: patched }
  },

  confirmBom(soId) {
    const next = structuredClone(state)
    const soRow = next.salesOrders.find((s) => s.id === soId)
    if (soRow?.closeStatus === 'closed') return fail('销售订单已取消，不能再确认 BOM')
    const bom = next.boms.find((b) => b.soId === soId)
    if (!bom) return fail('请先保存 BOM')
    if (bom.closeStatus === 'closed') return fail('BOM 已取消，请先回退')
    if (!(bom.lines || []).length) return fail('BOM 没有物料行')
    if (bom.lines.some((l) => !l.productId)) return fail('还有未建档的定制件，请先勾选并建成商品物料')
    bom.confirmed = true
    bom.confirmedAt = now()
    const lines = suggestLinesOf(next, bom)
    const sug = next.suggests.find((s) => s.bomId === bom.id)
    if (sug) {
      sug.confirmed = false
      sug.lines = lines
    } else {
      next.suggests.push({ id: uid('SUG'), soId, bomId: bom.id, confirmed: false, lines })
    }
    pushLog(next, '确认 BOM', { soId, module: 'BOM' })
    setState(next)
    return ok('BOM 已确认。已按库存生成采购建议，可一键生成采购订单')
  },

  cancelBom(soId) {
    const next = structuredClone(state)
    const bom = next.boms.find((b) => b.soId === soId)
    if (!bom) return fail('没有 BOM')
    if (bom.closeStatus === 'closed') return fail('已经取消')
    if (!bomCanCancel(next, soId)) return fail('已按 BOM 生成下游采购订单，须先回退这些采购订单')
    bom.closeStatus = 'closed'
    bom.cancelledAt = now()
    next.suggests = next.suggests.filter((s) => s.soId !== soId)
    pushLog(next, `取消 BOM ${bom.id}`, { soId, module: 'BOM' })
    setState(next)
    return ok('BOM 已取消')
  },

  reopenBom(soId) {
    const next = structuredClone(state)
    const bom = next.boms.find((b) => b.soId === soId)
    if (!bom) return fail('没有 BOM')
    if (bom.closeStatus !== 'closed') return fail('不是已取消状态')
    bom.closeStatus = 'open'
    bom.cancelledAt = ''
    pushLog(next, `回退 BOM（撤销取消）${bom.id}`, { soId, module: 'BOM' })
    setState(next)
    return ok('已回退，回到取消前的状态')
  },

  rollbackBom(soId) {
    const next = structuredClone(state)
    if (next.boms.find((b) => b.soId === soId)?.closeStatus === 'closed') return fail('BOM 已取消，请先回退')
    if (next.purchaseOrders.some((p) => p.soId === soId && isBomPo(p))) return fail('已按 BOM 下过物料采购单，须先回退这些采购订单')
    const bom = next.boms.find((b) => b.soId === soId)
    if (!bom) return fail('没有 BOM')
    next.suggests = next.suggests.filter((s) => s.soId !== soId)
    if (bom.confirmed) {
      bom.confirmed = false
      bom.confirmedAt = ''
      pushLog(next, '回退 BOM 确认', { soId, module: 'BOM' })
      setState(next)
      return ok('已回退确认，BOM 回到草稿')
    }
    next.boms = next.boms.filter((b) => b.soId !== soId)
    pushLog(next, '回退 BOM 草稿', { soId, module: 'BOM' })
    setState(next)
    return ok('已回退草稿 BOM')
  },

  saveSuggest(soId, lines) {
    const next = structuredClone(state)
    const sug = next.suggests.find((s) => s.soId === soId)
    if (!sug) return fail('请先确认 BOM')
    if (sug.confirmed) return fail('已经下过单，不能改采购数量')
    sug.lines = lines
    pushLog(next, `修改采购建议的采购数量（${(lines || []).length} 项）`, { soId, module: '采购' })
    setState(next)
    return ok('采购建议已保存')
  },

  confirmSuggest(soId, lines, opts = {}) {
    const next = structuredClone(state)
    const soRow = next.salesOrders.find((s) => s.id === soId)
    if (soRow?.closeStatus === 'closed') return fail('销售订单已取消，不能再生成采购订单')
    const bom = next.boms.find((b) => b.soId === soId && b.confirmed)
    if (!bom) return fail('请先确认 BOM')
    const sug = next.suggests.find((s) => s.soId === soId)
    if (sug?.confirmed) return fail('已经下过单')
    const draft = lines || sug?.lines || suggestLinesOf(next, bom)
    if (sug) sug.lines = draft
    const grouped = {}
    draft.forEach((l) => {
      if (l.buy === false) return
      const qty = Number(l.qty || 0)
      if (!l.productId || qty <= 0 || !l.supplierId) return
      if (!grouped[l.supplierId]) grouped[l.supplierId] = []
      const p = next.products.find((x) => x.id === l.productId)
      grouped[l.supplierId].push({ productId: l.productId, qty, price: p?.type === '常备料' ? 2 : 800 })
    })
    const keys = Object.keys(grouped)
    if (!keys.length) return fail('请勾选要下单的物料，并填写采购数量')
    const so = next.salesOrders.find((s) => s.id === soId)
    const t = now()
    keys.forEach((supplierId) => {
      const supplier = next.suppliers.find((s) => s.id === supplierId)
      const lines = grouped[supplierId]
      const allStock = lines.every((l) => next.products.find((x) => x.id === l.productId)?.type === '常备料')
      next.purchaseOrders.push({
        id: uid('PO'),
        soId: allStock ? '' : soId,
        supplierId,
        closeStatus: 'open',
        confirmStatus: 'confirmed',
        inboundStatus: 'none',
        settlementStatus: 'unpaid',
        shipped: supplier?.type === '网购',
        shippedAt: supplier?.type === '网购' ? t : '',
        address: opts.address || '本厂',
        customAddress: opts.customAddress || '',
        createdAt: t,
        confirmedAt: t,
        eta: opts.eta || so?.plan?.purchase || so?.fallDue?.purchase || plusDays(today(), 7),
        confirmEta: opts.eta || '',
        payDue: opts.payDue || '',
        fromSuggest: true,
        notes: [],
        lines,
      })
    })
    if (sug) sug.confirmed = true
    pushLog(next, `按 BOM 生成 ${keys.length} 张采购订单`, { soId, module: '采购' })
    setState(next)
    return ok(`已按 BOM、按供应商生成 ${keys.length} 张采购订单（不跨项目）`)
  },

  rollbackPO(poId) {
    const next = structuredClone(state)
    if (next.inboundOrders.some((p) => p.poId === poId)) return fail('已有采购入库单，须先回退入库单')
    if (next.returns.some((r) => r.poId === poId)) return fail('已有采购退货单，须先回退退货')
    const po = next.purchaseOrders.find((p) => p.id === poId)
    next.purchaseOrders = next.purchaseOrders.filter((p) => p.id !== poId)
    const left = next.purchaseOrders.filter((p) => p.soId === po.soId && isBomPo(p))
    if (!left.length) {
      const sug = next.suggests.find((s) => s.soId === po.soId)
      if (sug) sug.confirmed = false
    }
    pushLog(next, `回退采购订单 ${poId}`, { soId: po.soId, module: '采购', billId: poId })
    setState(next)
    return ok('采购订单已回退')
  },

  markShipped(poId) {
    const next = structuredClone(state)
    const po = next.purchaseOrders.find((p) => p.id === poId)
    if (!po) return fail('采购订单不存在')
    if (po.confirmStatus !== 'confirmed') return fail('请先确认采购订单')
    if (po.closeStatus === 'closed') return fail('已取消订单不能发货')
    po.shipped = true
    po.shippedAt = now()
    if (!po.confirmEta) po.confirmEta = po.eta || today()
    next.exceptions = next.exceptions.map((e) => (e.poId === poId && e.process === '采购' ? { ...e, doneStatus: 'done' } : e))
    pushLog(next, `供应商发货 ${poId}，本单进入在途`, { soId: po.soId, module: '采购', billId: poId })
    setState(next)
    return ok('已确认供应商发货，本单进入在途')
  },

  confirmPO(poId) {
    const next = structuredClone(state)
    const po = next.purchaseOrders.find((p) => p.id === poId)
    if (!po) return fail('采购订单不存在')
    if (po.closeStatus === 'closed') return fail('已取消订单不能确认')
    if (po.confirmStatus === 'confirmed') return fail('已经确认')
    const matType = poMatType(next, po)
    if (matType === '项目料' && !po.soId) return fail('项目料必须关联项目后才能确认')
    if (matType === '常备料') po.soId = ''
    po.confirmStatus = 'confirmed'
    po.confirmedAt = now()
    const sup = next.suppliers.find((s) => s.id === po.supplierId)
    if (sup?.type === '网购') {
      po.shipped = true
      po.shippedAt = po.confirmedAt
    }
    pushLog(next, `确认采购订单 ${poId}`, { soId: po.soId, module: '采购', billId: poId })
    setState(next)
    return ok('采购订单已确认下单')
  },

  cancelPO(poId) {
    const next = structuredClone(state)
    const po = next.purchaseOrders.find((p) => p.id === poId)
    if (!po) return fail('采购订单不存在')
    if (po.closeStatus === 'closed') return fail('订单已是已取消')
    if (po.confirmStatus === 'confirmed' && next.inboundOrders.some((p) => p.poId === poId)) {
      return fail('已有关联入库单，不能取消。须先回退入库单。')
    }
    po.closeStatus = 'closed'
    pushLog(next, `取消采购订单 ${poId}`, { soId: po.soId, module: '采购', billId: poId })
    setState(next)
    return ok('采购订单已取消')
  },

  reopenPO(poId) {
    const next = structuredClone(state)
    const po = next.purchaseOrders.find((p) => p.id === poId)
    if (!po) return fail('采购订单不存在')
    if (po.closeStatus !== 'closed') return fail('当前不是已取消')
    po.closeStatus = 'open'
    pushLog(next, `回退采购订单（撤销取消）${poId}`, { soId: po.soId, module: '采购', billId: poId })
    setState(next)
    return ok('已回退，回到取消前的状态')
  },

  /**
   * 完结订单：部分入库后，剩余不再要了，表示「已入库的部分就算完结」。
   * 前置：已确认、未全部入库、已至少有一张已确认入库、且没有未入库的入库单。
   */
  completePO(poId, reason) {
    const next = structuredClone(state)
    const po = next.purchaseOrders.find((p) => p.id === poId)
    if (!po) return fail('采购订单不存在')
    if (po.closeStatus === 'closed') return fail('订单已取消，不能完结')
    if (po.confirmStatus !== 'confirmed') return fail('请先确认采购订单')
    if (po.completeStatus === 'done') return fail('订单已经完结')
    if (po.inboundStatus === 'all') return fail('已全部入库，不需要完结')
    const pending = poPendingPIs(next, poId)
    if (pending.length) {
      return fail(`本单还有 ${pending.length} 张未入库的入库单（${pending.map((p) => p.id).join('、')}），请先回退或作废后再完结`)
    }
    const got = next.inboundOrders.some((p) => p.poId === poId && p.confirmed)
    if (!got) return fail('还没有任何已入库记录，请用「取消」而不是完结')
    po.completeStatus = 'done'
    po.completedAt = now()
    po.completeReason = reason || ''
    pushLog(next, `完结采购订单 ${poId}${reason ? `（${reason}）` : ''}`, { soId: po.soId, module: '采购', billId: poId })
    setState(next)
    return ok('采购订单已完结，剩余未交部分不再计入在途')
  },

  reopenPOComplete(poId) {
    const next = structuredClone(state)
    const po = next.purchaseOrders.find((p) => p.id === poId)
    if (!po) return fail('采购订单不存在')
    if (po.completeStatus !== 'done') return fail('当前不是已完结')
    po.completeStatus = 'open'
    po.completedAt = ''
    pushLog(next, `回退完结采购订单 ${poId}`, { soId: po.soId, module: '采购', billId: poId })
    setState(next)
    return ok('已回退完结，剩余未交部分重新计入在途')
  },

  /**
   * 一键升级（黄灯 → 红灯）：升级后**每天提醒**，直到在采购订单列表点「确认发货」。
   * 确认发货会把本单的采购异常一并置为已完成，produceRemind 也会因为 shipped 直接返回 null，提醒就此停止。
   */
  escalateProduce(poId) {
    const next = structuredClone(state)
    const po = next.purchaseOrders.find((p) => p.id === poId)
    if (!po) return fail('采购订单不存在')
    if (po.produceRed) return fail('已经是红灯了（每天提醒中）')
    po.produceRed = true
    const at = now()
    const t = '一键升级：供应商生产改为每天提醒，直到确认发货'
    if (!po.notes) po.notes = []
    po.notes.unshift({ at, by: '维', text: t })
    const cfg = reminderOf(next, 'producing')
    const people = (cfg?.people || []).filter(Boolean)
    const names = people.map((empId) => next.employees.find((e) => e.id === empId)?.name).filter(Boolean).join('、')
    // 同一采购单只保留一条未完结的采购异常：有就把等级改成红并追加，没有才新建
    const openEx = next.exceptions.find((e) => e.poId === poId && e.process === '采购' && exOpen(e))
    if (openEx) {
      openEx.level = 'red'
      openEx.title = `供应商生产超期 · ${poId}`
      openEx.content = '已升级红灯：每天提醒，直到确认发货。'
      openEx.notes = openEx.notes || []
      openEx.notes.unshift({ at, by: '维', text: '一键升级为红灯' })
    } else {
      next.exceptions.unshift({
        id: uid('EXC'),
        process: '采购',
        title: `供应商生产超期 · ${poId}`,
        content: '已升级红灯：每天提醒，直到确认发货。',
        soId: po.soId || '',
        poId,
        people,
        level: 'red',
        doneStatus: 'open',
        closeStatus: 'open',
        createdAt: at,
        createdBy: '维',
        notes: [{ at, by: '维', text: '一键升级为红灯' }],
      })
    }
    pushLog(next, `供应商生产一键升级为红灯，每天提醒${names ? ` ${names}` : ''}：${poId}`, { soId: po.soId, module: '采购', billId: poId })
    setState(next)
    return ok(`已升级红灯，每天提醒${names ? ` ${names}` : ''}，直到点「确认发货」`)
  },

  setPoPayDue(poId, date) {
    const next = structuredClone(state)
    const po = next.purchaseOrders.find((p) => p.id === poId)
    if (!po) return fail('采购订单不存在')
    po.payDue = date || ''
    pushLog(next, `设置预计付款日 ${poId} = ${date || '未设'}`, { soId: po.soId, module: '采购', billId: poId })
    setState(next)
    return ok('已保存预计付款日')
  },

  /** 供应商跟进记录：只留档，不进异常中心。要拉人盯就走「一键升级」。 */
  addPoNote(poId, text) {
    const next = structuredClone(state)
    const po = next.purchaseOrders.find((p) => p.id === poId)
    if (!po) return fail('采购订单不存在')
    if (poMatType(next, po) === '常备料') return fail('常备料是库存补货单，不需要逐条写供应商跟进')
    const t = String(text || '').trim()
    if (!t) return fail('请填写跟进内容')
    if (!po.notes) po.notes = []
    po.notes.unshift({ at: now(), by: '维', text: t })
    pushLog(next, `供应商跟进：${t}`, { soId: po.soId, module: '采购', billId: poId })
    setState(next)
    return ok('已记录跟进')
  },

  rollbackShip(poId) {
    const next = structuredClone(state)
    if (next.inboundOrders.some((p) => p.poId === poId && p.confirmed)) return fail('已有确认入库单，须先回退入库单')
    const shipPo = next.purchaseOrders.find((p) => p.id === poId)
    shipPo.shipped = false
    shipPo.shippedAt = ''
    // 回退发货 → 这张单回到"未发货"，按提醒策略该进异常的就重新进异常（把确认发货时自动关掉的那条重新打开）
    let reopened = 0
    next.exceptions = next.exceptions.map((e) => {
      if (e.poId === poId && e.process === '采购' && e.doneStatus === 'done' && e.closeStatus !== 'closed') {
        reopened += 1
        return { ...e, doneStatus: 'open', reopenedAt: now() }
      }
      return e
    })
    pushLog(next, `回退确认发货 ${poId}（重新打开采购异常 ${reopened} 条）`, { soId: shipPo.soId, module: '采购', billId: poId })
    setState(next)
    return ok(reopened ? `已回退确认发货，按提醒策略重新打开 ${reopened} 条采购异常` : '已回退确认发货；该单当前没有需要重新打开的异常')
  },

  createPI(poId, lines, remark) {
    const next = structuredClone(state)
    const po = next.purchaseOrders.find((p) => p.id === poId)
    if (!po) return fail('采购订单不存在')
    if (po.closeStatus === 'closed') return fail('已取消订单不能入库')
    if (po.confirmStatus !== 'confirmed') return fail('请先确认采购订单')
    if (po.inboundStatus === 'all') return fail('该采购订单已全部入库')
    if (po.completeStatus === 'done') return fail('订单已完结，不能再开入库单。如需继续收货，请先在采购订单上回退完结')
    const keep = (lines || []).filter((l) => Number(l.qty) > 0)
    if (!keep.length) return fail('请填写本批数量')
    for (const l of keep) {
      const left = remainQty(po, l.productId, next)
      if (Number(l.qty) > left) return fail(`${product(l.productId)?.name || l.productId} 本批不能超过剩余可入库 ${left}`)
    }
    const sup = next.suppliers.find((s) => s.id === po.supplierId)
    const online = sup?.type === '网购'
    const id = uid('PI')
    next.inboundOrders.unshift({
      id,
      poId,
      confirmed: false,
      shipped: online,
      shippedAt: online ? now() : '',
      closeStatus: 'open',
      createdAt: now(),
      remark,
      lines: keep,
    })
    pushLog(next, `新建采购入库单 ${id}${online ? '（网购自动在途）' : '（待发货）'}`, { soId: po.soId, module: '采购', billId: id })
    setState(next)
    return { ...ok(online ? '网购渠道自动在途，等货到后点「确认入库」' : '采购入库单已保存（待发货）'), id }
  },

  /** 供应商生产型的货：生产完点了发货才进在途；网购不需要点 */
  markPIShip(id) {
    const next = structuredClone(state)
    const pi = next.inboundOrders.find((p) => p.id === id)
    if (!pi) return fail('采购入库单不存在')
    if (pi.closeStatus === 'closed') return fail('单据已取消，请先回退')
    if (pi.confirmed) return fail('已入库，不用再发货')
    if (pi.shipped) return fail('已经在途')
    pi.shipped = true
    pi.shippedAt = now()
    const po = next.purchaseOrders.find((p) => p.id === pi.poId)
    if (po) po.shipped = true
    pushLog(next, `采购入库单确认发货 ${id}`, { soId: po?.soId || '', module: '采购', billId: id })
    setState(next)
    return ok('已确认发货，进入采购在途')
  },

  rollbackPIShip(id) {
    const next = structuredClone(state)
    const pi = next.inboundOrders.find((p) => p.id === id)
    if (!pi) return fail('采购入库单不存在')
    if (pi.closeStatus === 'closed') return fail('单据已取消，请先回退')
    if (pi.confirmed) return fail('已入库，须先回退入库确认')
    if (!pi.shipped) return fail('还没发货')
    pi.shipped = false
    pi.shippedAt = ''
    const po = next.purchaseOrders.find((p) => p.id === pi.poId)
    if (po && !next.inboundOrders.some((x) => x.poId === po.id && x.id !== id && x.shipped)) {
      po.shipped = false
      po.shippedAt = ''
    }
    pushLog(next, `采购入库单回退发货 ${id}`, { soId: po?.soId || '', module: '采购', billId: id })
    setState(next)
    return ok('已回到待发货')
  },

  /** 确认入库。actualLines 可传每行实收数量；实收少于单据数量时，差额自动拆出一张新的待入库单。 */
  confirmPI(id, actualLines) {
    const next = structuredClone(state)
    const pi = next.inboundOrders.find((p) => p.id === id)
    if (pi.closeStatus === 'closed') return fail('单据已取消，请先回退')
    if (pi.confirmed) return fail('已确认')
    if (!pi.shipped) return fail('还没发货。请先点「确认发货」，货到后在这里确认入库')
    const po = next.purchaseOrders.find((p) => p.id === pi.poId)
    if (po?.completeStatus === 'done') return fail('采购订单已完结，不能再入库。如需收货请先回退完结')
    const declared = pi.lines || []
    const actual = declared.map((l) => {
      const hit = (actualLines || []).find((x) => x.productId === l.productId)
      const raw = hit == null ? Number(l.qty) : Number(hit.qty)
      const capped = Math.min(Number(l.qty) || 0, Number.isFinite(raw) ? raw : Number(l.qty) || 0)
      return { productId: l.productId, qty: Math.max(0, capped) }
    })
    const keep = actual.filter((l) => l.qty > 0)
    if (!keep.length) return fail('实收数量不能全部为 0。一件都没到的话，等货到了再确认入库')
    const shorts = actual
      .map((l) => ({ productId: l.productId, qty: (declared.find((x) => x.productId === l.productId)?.qty || 0) - l.qty }))
      .filter((l) => l.qty > 0)

    for (const l of keep) {
      const left = remainQty(po, l.productId, next)
      if (Number(l.qty) > left) return fail(`${product(l.productId)?.name || l.productId} 本批不能超过剩余可入库 ${left}`)
    }

    // 实收不足：差额自动拆出一张新的待入库单，继承采购订单关联
    let shortId = ''
    if (shorts.length) {
      shortId = uid('PI')
      next.inboundOrders.unshift({
        id: shortId,
        poId: pi.poId,
        confirmed: false,
        shipped: false,
        closeStatus: 'open',
        createdAt: now(),
        remark: `${pi.id} 实收不足自动分出`,
        shortOf: pi.id,
        lines: shorts,
      })
    }

    pi.lines = keep
    pi.confirmed = true
    pi.confirmedAt = now()
    if (shorts.length) pi.shortSplitTo = shortId
    if (po.address === '本厂') {
      pi.lines.forEach((l) => {
        const p = next.products.find((x) => x.id === l.productId)
        if (p) p.stock += l.qty
        pushLedger(next, { productId: l.productId, qty: l.qty, dir: 'in', type: '采购入库', billId: pi.id, remark: pi.remark || '' })
      })
    } else {
      // 客户地址直发：不进本厂可用，只记「签收完结 + 签收时间」，方便以后追溯哪天签的
      pi.signed = true
      pi.signedAt = now()
      pushLog(next, `客户地址签收完结 ${pi.id}`, { soId: po.soId, module: '采购', billId: pi.id })
    }
    refreshInbound(po, next)
    if (po.inboundStatus === 'all') po.inboundDoneAt = now()
    setState(next)
    if (shorts.length) return ok(`已按实收入库，差额已拆成新的待入库单 ${shortId}（待发货）`)
    return ok(po.address === '本厂' ? '入库确认，已进可用并形成应付' : '客户地址签收完结，不进可用，已形成应付')
  },

  rollbackPI(id) {
    const next = structuredClone(state)
    const pi = next.inboundOrders.find((p) => p.id === id)
    if (pi.closeStatus === 'closed') return fail('单据已取消，请先回退')
    const po = next.purchaseOrders.find((p) => p.id === pi.poId)
    if (po?.completeStatus === 'done') return fail('采购订单已完结，请先在采购订单上回退完结')
    if (next.returns.some((r) => r.poId === po.id && r.confirmStatus === 'confirmed')) return fail('本采购订单已有已确认退货，须先回退退货')
    const pb = payBillOf(next, po.id)
    if ((pb?.settles || []).length > 0) return fail(`付款单 ${pb.id} 上已有付款，须先回退这笔付款`)
    const pp = next.productionPlans.find((p) => p.soId === po.soId && p.done)
    if (pp && !po.part) return fail('生产已确认完成占用原料，须先回退确认完成')
    if (pi.confirmed && po.address === '本厂') {
      pi.lines.forEach((l) => {
        const p = next.products.find((x) => x.id === l.productId)
        if (p) p.stock -= l.qty
      })
      dropLedger(next, pi.id)
    }
    pi.confirmed = false
    pi.confirmedAt = ''
    pi.signed = false
    pi.signedAt = ''
    refreshInbound(po, next)
    if (po.inboundStatus !== 'all') po.inboundDoneAt = ''
    pushLog(next, `回退采购入库 ${id}（实收库存已扣回）`, { soId: po?.soId || '', module: '采购', billId: id })
    setState(next)
    return ok('入库已回退到草稿，本单实收的库存已扣回（差额子单是另一张单，各自单独处理）')
  },

  cancelPI(id) {
    const next = structuredClone(state)
    const pi = next.inboundOrders.find((p) => p.id === id)
    if (!pi) return fail('采购入库单不存在')
    if (pi.closeStatus === 'closed') return fail('已经取消')
    if (pi.confirmed) return fail('已入库不能取消，请先回退确认，回到待入库后再取消')
    pi.closeStatus = 'closed'
    pi.cancelledAt = now()
    pushLog(next, `取消采购入库单 ${id}`, { soId: next.purchaseOrders.find((p) => p.id === pi.poId)?.soId || '', module: '采购', billId: id })
    setState(next)
    return ok('采购入库单已取消')
  },

  reopenPI(id) {
    const next = structuredClone(state)
    const pi = next.inboundOrders.find((p) => p.id === id)
    if (!pi) return fail('采购入库单不存在')
    if (pi.closeStatus !== 'closed') return fail('不是已取消状态')
    pi.closeStatus = 'open'
    pi.cancelledAt = ''
    pushLog(next, `回退采购入库单（撤销取消）${id}`, { soId: next.purchaseOrders.find((p) => p.id === pi.poId)?.soId || '', module: '采购', billId: id })
    setState(next)
    return ok('已回退，回到取消前的状态')
  },

  deletePI(id) {
    const next = structuredClone(state)
    const pi = next.inboundOrders.find((p) => p.id === id)
    if (pi.confirmed) return fail('已确认不能删除，请先回退确认')
    next.inboundOrders = next.inboundOrders.filter((p) => p.id !== id)
    pushLog(next, `删除采购入库单草稿 ${id}`, { soId: next.purchaseOrders.find((p) => p.id === pi.poId)?.soId || '', module: '采购', billId: id })
    setState(next)
    return ok('草稿已删除，不再出现在列表；删除已记入操作记录')
  },

  /**
   * 在付款单上登记一次付款（金蝶「付款单」的本次付款金额）。
   * form = { amount, date, adjust, adjustReason, method, note }
   * - amount：本次实付金额
   * - adjust：本次对**应付金额**的调整（+ 涨价 / − 抹零），带原因；影响这张付款单的应付合计
   */
  payBillSettle(billId, form = {}) {
    const next = structuredClone(state)
    const bill = next.payBills.find((b) => b.id === billId)
    if (!bill) return fail('付款单不存在')
    const po = next.purchaseOrders.find((p) => p.id === bill.poId)
    if (po?.closeStatus === 'closed') return fail('采购订单已取消，不能付款')
    const n = Number(form.amount)
    if (!n || n <= 0) return fail('请输入本次付款金额')
    const adjust = Number(form.adjust || 0)
    const due = payBillDue(bill, next)
    const total = due.total + adjust
    const left = total - due.paid
    if (left <= 0.001) return fail('这张付款单已经没有未付了')
    if (n > left + 0.001) {
      return fail(`本次付款不能超过未付 ¥${Math.round(left).toLocaleString()}（应付合计 ¥${Math.round(total).toLocaleString()} − 已付 ¥${Math.round(due.paid).toLocaleString()}）`)
    }
    bill.settles.push({
      id: uid('PS'),
      date: form.date || today(),
      amount: n,
      adjust,
      adjustReason: adjust ? (form.adjustReason || '未填原因') : '',
      method: form.method || '转账',
      note: form.note || '',
    })
    if (!bill.date) bill.date = form.date || today()
    pushLog(
      next,
      `付款单 ${bill.id} 付款 ¥${n.toLocaleString()}${adjust ? `（应付调整 ${adjust > 0 ? '+' : ''}${adjust.toLocaleString()}，原因：${form.adjustReason || '未填'}）` : ''}`,
      { soId: bill.soId, module: '付款', billId: bill.id },
    )
    setState(next)
    return ok(`已登记付款 ¥${n.toLocaleString()}${adjust ? `，应付合计调整为 ¥${Math.round(total).toLocaleString()}` : ''}（未付剩 ¥${Math.round(Math.max(0, left - n)).toLocaleString()}）`)
  },

  /** 回退付款单上的某一笔付款 */
  rollbackPaySettle(billId, settleId) {
    const next = structuredClone(state)
    const bill = next.payBills.find((b) => b.id === billId)
    const row = (bill?.settles || []).find((s) => s.id === settleId)
    if (!row) return fail('付款明细不存在')
    bill.settles = bill.settles.filter((s) => s.id !== settleId)
    pushLog(next, `回退付款单 ${bill.id} 的付款 ¥${Number(row.amount).toLocaleString()}`, { soId: bill.soId, module: '付款', billId: bill.id })
    setState(next)
    return ok('已回退该笔付款')
  },

  /** 保存付款单单据头（业务日期 / 备注） */
  savePayBill(billId, form = {}) {
    const next = structuredClone(state)
    const bill = next.payBills.find((b) => b.id === billId)
    if (!bill) return fail('付款单不存在')
    if (form.date !== undefined) bill.date = dayOf(form.date)
    if (form.remark !== undefined) bill.remark = form.remark
    pushLog(next, `修改付款单 ${bill.id}（业务日期 / 备注）`, { soId: bill.soId, module: '付款', billId: bill.id })
    setState(next)
    return ok('付款单已保存')
  },

  /**
   * 在收款单上登记一次收款。
   * form = { amount, date, adjust, adjustReason, method, note }
   * - adjust：本次对**应收金额**的调整（+ 增加 / − 让价抹零），带原因；影响这张收款单的应收合计
   */
  rcvBillSettle(billId, form = {}) {
    const next = structuredClone(state)
    const bill = next.rcvBills.find((b) => b.id === billId)
    if (!bill) return fail('收款单不存在')
    const so = next.salesOrders.find((s) => s.id === bill.soId)
    if (so?.closeStatus === 'closed') return fail('订单已取消，不能收款')
    const n = Number(form.amount)
    if (!n || n <= 0) return fail('请输入本次收款金额')
    const adjust = Number(form.adjust || 0)
    const due = rcvBillDue(bill, next)
    const total = due.total + adjust
    const left = total - due.paid
    if (left <= 0.001) return fail('这张收款单已经没有未收了')
    if (n > left + 0.001) {
      return fail(`本次收款不能超过未收 ¥${Math.round(left).toLocaleString()}（应收合计 ¥${Math.round(total).toLocaleString()} − 已收 ¥${Math.round(due.paid).toLocaleString()}）`)
    }
    bill.settles.push({
      id: uid('RS'),
      date: form.date || today(),
      amount: n,
      adjust,
      adjustReason: adjust ? (form.adjustReason || '未填原因') : '',
      method: form.method || '转账',
      note: form.note || '',
    })
    if (!bill.date) bill.date = form.date || today()
    pushLog(
      next,
      `收款单 ${bill.id} 收款 ¥${n.toLocaleString()}${adjust ? `（应收调整 ${adjust > 0 ? '+' : ''}${adjust.toLocaleString()}，原因：${form.adjustReason || '未填'}）` : ''}`,
      { soId: bill.soId, module: '收款', billId: bill.id },
    )
    setState(next)
    return ok(`已登记收款 ¥${n.toLocaleString()}${adjust ? `，应收合计调整为 ¥${Math.round(total).toLocaleString()}` : ''}（未收剩 ¥${Math.round(Math.max(0, left - n)).toLocaleString()}）`)
  },

  /** 回退收款单上的某一笔收款 */
  rollbackRcvSettle(billId, settleId) {
    const next = structuredClone(state)
    const bill = next.rcvBills.find((b) => b.id === billId)
    const row = (bill?.settles || []).find((s) => s.id === settleId)
    if (!row) return fail('收款明细不存在')
    bill.settles = bill.settles.filter((s) => s.id !== settleId)
    pushLog(next, `回退收款单 ${bill.id} 的收款 ¥${Number(row.amount).toLocaleString()}`, { soId: bill.soId, module: '收款', billId: bill.id })
    setState(next)
    return ok('已回退该笔收款')
  },

  /** 保存收款单单据头（业务日期 / 备注） */
  saveRcvBill(billId, form = {}) {
    const next = structuredClone(state)
    const bill = next.rcvBills.find((b) => b.id === billId)
    if (!bill) return fail('收款单不存在')
    if (form.date !== undefined) bill.date = dayOf(form.date)
    if (form.remark !== undefined) bill.remark = form.remark
    pushLog(next, `修改收款单 ${bill.id}（业务日期 / 备注）`, { soId: bill.soId, module: '收款', billId: bill.id })
    setState(next)
    return ok('收款单已保存')
  },

  createReturn(poId, lines, reason) {
    const next = structuredClone(state)
    const po = next.purchaseOrders.find((p) => p.id === poId)
    if (!po) return fail('必须关联采购订单')
    if (!next.inboundOrders.some((p) => p.poId === poId && p.confirmed)) return fail('尚无已确认入库，请走回退采购订单而不是退货')
    const use = (lines || []).filter((l) => Number(l.qty) > 0)
    if (!use.length) return fail('请填写退货数量')
    for (const l of use) {
      const got = inboundQty(poId, l.productId, next)
      const back = returnedQty(poId, l.productId, next)
      if (Number(l.qty) > got - back) return fail(`${product(l.productId)?.name || l.productId} 退货数量不能超过已入库未退 ${Math.max(0, got - back)}`)
    }
    const rtn = { id: uid('RTN'), poId, confirmStatus: 'draft', closeStatus: 'open', createdAt: now(), reason: String(reason || '').trim(), lines: use }
    next.returns.unshift(rtn)
    pushLog(next, `新建采购退货单草稿 ${rtn.id}`, { soId: po.soId, module: '采购', billId: rtn.id })
    setState(next)
    return { ok: true, id: rtn.id, message: `采购退货单 ${rtn.id} 已保存为草稿` }
  },

  /** 详情页保存：草稿可改退货数量 / 原因 */
  saveReturn(id, form = {}) {
    const next = structuredClone(state)
    const rtn = next.returns.find((r) => r.id === id)
    if (!rtn) return fail('采购退货单不存在')
    if (rtn.closeStatus === 'closed') return fail('已取消，请先回退')
    if (rtn.confirmStatus === 'confirmed') return fail('已确认，请先回退确认再改')
    if (form.lines) {
      const use = form.lines.filter((l) => Number(l.qty) > 0)
      if (!use.length) return fail('请填写退货数量')
      for (const l of use) {
        const max = returnableQty(rtn.poId, l.productId, next, rtn.id)
        if (Number(l.qty) > max) return fail(`${product(l.productId)?.name || l.productId} 退货数量不能超过已入库未退 ${max}`)
      }
      rtn.lines = use
    }
    if (form.reason !== undefined) rtn.reason = String(form.reason || '').trim()
    pushLog(next, `修改采购退货单 ${id}`, { module: '采购', billId: id })
    setState(next)
    return ok('采购退货单已保存')
  },

  confirmReturn(id) {
    const next = structuredClone(state)
    const rtn = next.returns.find((r) => r.id === id)
    if (!rtn) return fail('采购退货单不存在')
    if (rtn.closeStatus === 'closed') return fail('退货单已取消，请先回退')
    if (rtn.confirmStatus === 'confirmed') return fail('已经确认过了')
    if (!(rtn.lines || []).length) return fail('没有退货明细，不能确认')
    rtn.confirmStatus = 'confirmed'
    rtn.confirmedAt = now()
    const ro = { id: uid('RTO'), rtnId: id, poId: rtn.poId, status: 'pending', closeStatus: 'open', lines: rtn.lines, createdAt: now() }
    next.returnOuts.unshift(ro)
    pushLog(next, `确认采购退货单 ${id}，自动生成退货出库单 ${ro.id}（待出库）`, { module: '采购', billId: id })
    setState(next)
    return { ok: true, id: ro.id, message: `退货已确认，已自动生成退货出库单 ${ro.id}（待出库）。可直接去「采购退货出库单」点确认出库，出库后自动冲减应付。` }
  },

  rollbackReturn(id) {
    const next = structuredClone(state)
    const rtn = next.returns.find((r) => r.id === id)
    if (!rtn) return fail('采购退货单不存在')
    if (rtn.closeStatus === 'closed') return fail('退货单已取消，请先回退')
    // 一张退货单可能先后开过多张出库单（取消过再重开），所以要看**所有未取消的**出库单，不能只看第一张
    const rtos = next.returnOuts.filter((o) => o.rtnId === id && o.closeStatus !== 'closed')
    const outed = rtos.filter((o) => o.status === 'done')
    if (outed.length) return fail(`退货出库单 ${outed.map((o) => o.id).join('、')} 已出库，须先回退出库`)
    next.returnOuts = next.returnOuts.filter((o) => o.rtnId !== id)
    rtn.confirmStatus = 'draft'
    rtn.confirmedAt = ''
    pushLog(next, `回退采购退货单确认 ${id}`, { module: '采购', billId: id })
    setState(next)
    return ok('退货单已回退为草稿，自动生成的待出库出库单已一并撤销')
  },

  cancelReturn(id) {
    const next = structuredClone(state)
    const rtn = next.returns.find((r) => r.id === id)
    if (!rtn) return fail('采购退货单不存在')
    if (rtn.closeStatus === 'closed') return fail('已经取消')
    if (rtn.confirmStatus === 'confirmed') return fail('已确认不能取消，请先回退确认')
    rtn.closeStatus = 'closed'
    rtn.cancelledAt = now()
    pushLog(next, `取消采购退货单 ${id}`, { module: '采购', billId: id })
    setState(next)
    return ok('采购退货单已取消')
  },

  reopenReturn(id) {
    const next = structuredClone(state)
    const rtn = next.returns.find((r) => r.id === id)
    if (!rtn) return fail('采购退货单不存在')
    if (rtn.closeStatus !== 'closed') return fail('不是已取消状态')
    rtn.closeStatus = 'open'
    rtn.cancelledAt = ''
    pushLog(next, `回退采购退货单（撤销取消）${id}`, { module: '采购', billId: id })
    setState(next)
    return ok('已回退，回到取消前的状态')
  },

  createReturnOut(rtnId) {
    const next = structuredClone(state)
    const rtn = next.returns.find((r) => r.id === rtnId)
    if (!rtn) return fail('请选择采购退货单')
    if (rtn.closeStatus === 'closed') return fail('退货单已取消')
    if (rtn.confirmStatus !== 'confirmed') return fail('退货单还是草稿，请先确认退货单')
    if (next.returnOuts.some((o) => o.rtnId === rtnId)) return fail('本退货单已有出库单')
    const po = next.purchaseOrders.find((p) => p.id === rtn.poId)
    if (!po) return fail('找不到对应的采购订单')
    const row = { id: uid('RTO'), rtnId, poId: rtn.poId, status: 'pending', signed: false, closeStatus: 'open', lines: rtn.lines }
    next.returnOuts.unshift(row)
    pushLog(next, `按退货单 ${rtnId} 生成退货出库单 ${row.id}`, { module: '采购', billId: row.id })
    setState(next)
    return { ok: true, message: `已生成退货出库单 ${row.id}（待出库）`, id: row.id }
  },

  cancelReturnOut(id) {
    const next = structuredClone(state)
    const rto = next.returnOuts.find((o) => o.id === id)
    if (!rto) return fail('退货出库单不存在')
    if (rto.closeStatus === 'closed') return fail('已经取消')
    if (rto.status === 'done') return fail('已出库不能取消，请先回退出库')
    rto.closeStatus = 'closed'
    rto.cancelledAt = now()
    pushLog(next, `取消采购退货出库单 ${id}`, { module: '采购', billId: id })
    setState(next)
    return ok('退货出库单已取消')
  },

  reopenReturnOut(id) {
    const next = structuredClone(state)
    const rto = next.returnOuts.find((o) => o.id === id)
    if (!rto) return fail('退货出库单不存在')
    if (rto.closeStatus !== 'closed') return fail('不是已取消状态')
    rto.closeStatus = 'open'
    rto.cancelledAt = ''
    pushLog(next, `回退采购退货出库单（撤销取消）${id}`, { module: '采购', billId: id })
    setState(next)
    return ok('已回退，回到取消前的状态')
  },

  deleteReturn(id) {
    const next = structuredClone(state)
    const rtn = next.returns.find((r) => r.id === id)
    if (!rtn) return fail('退货单不存在')
    if (rtn.confirmStatus !== 'draft') return fail('已确认不能删除，请先回退确认')
    if (next.returnOuts.some((o) => o.rtnId === id)) return fail('已有退货出库单，不能删除')
    next.returns = next.returns.filter((r) => r.id !== id)
    pushLog(next, `删除退货单草稿 ${id}`, { soId: next.purchaseOrders.find((p) => p.id === rtn.poId)?.soId || '', module: '采购', billId: id })
    setState(next)
    return ok('草稿已删除，不再出现在列表；删除已记入操作记录')
  },

  confirmReturnOut(id) {
    const next = structuredClone(state)
    const rto = next.returnOuts.find((o) => o.id === id)
    if (!rto) return fail('退货出库单不存在')
    if (rto.closeStatus === 'closed') return fail('单据已取消，请先回退')
    for (const l of rto.lines) {
      const p = next.products.find((x) => x.id === l.productId)
      if (!p || p.stock < l.qty) return fail(`${p?.name || l.productId} 可用不足，不能退货出库`)
    }
    rto.lines.forEach((l) => {
      const p = next.products.find((x) => x.id === l.productId)
      if (p) p.stock -= l.qty
    })
    rto.status = 'done'
    rto.doneAt = now()
    // 退货出库即冲减应付，并写一条流水（回退出库会自动冲回）
    rto.lines.forEach((l) => pushLedger(next, { productId: l.productId, qty: l.qty, dir: 'out', type: '采购退货出库', billId: rto.id, remark: rto.remark || '' }))
    const amt = returnOutAmount(rto, next)
    pushLog(next, `确认采购退货出库 ${id}，冲减应付 ¥${Math.round(amt).toLocaleString()}`, { module: '采购', billId: id })
    setState(next)
    return ok(`已出库，扣可用，并冲减应付 ¥${Math.round(amt).toLocaleString()}`)
  },

  rollbackReturnOut(id) {
    const next = structuredClone(state)
    const rto = next.returnOuts.find((o) => o.id === id)
    if (!rto) return fail('退货出库单不存在')
    if (rto.closeStatus === 'closed') return fail('已取消，请先回退单据')
    if (rto.status === 'done') {
      rto.lines.forEach((l) => {
        const p = next.products.find((x) => x.id === l.productId)
        if (p) p.stock += l.qty
      })
      dropLedger(next, rto.id)
    }
    const amt = rto.status === 'done' ? returnOutAmount(rto, next) : 0
    rto.status = 'pending'
    rto.doneAt = ''
    pushLog(next, `回退采购退货出库 ${id}${amt ? `，应付加回 ¥${Math.round(amt).toLocaleString()}` : ''}`, { module: '采购', billId: id })
    setState(next)
    return ok(amt ? `退货出库已回到待出库，应付加回 ¥${Math.round(amt).toLocaleString()}` : '退货出库已回到待出库')
  },

  savePlan(soId, robot) {
    const next = structuredClone(state)
    const so = next.salesOrders.find((s) => s.id === soId)
    if (!so || so.confirmStatus !== 'confirmed') return fail('请先确认销售订单')
    let pp = next.productionPlans.find((p) => p.soId === soId)
    if (!pp) {
      /** 建计划就带上项目总计划的日期，编辑时在此基础上改 */
      const due = so.fallDue || {}
      pp = {
        id: uid('PP'),
        soId,
        done: false,
        confirmStatus: 'draft',
        progress: 0,
        steps: [
          { name: '结构', date: due.structure || '', target: 30, progress: 0 },
          { name: '电路', date: due.circuit || '', target: 80, progress: 0 },
          { name: '机器人', date: due.robot || '', target: 90, progress: 0 },
          { name: '装配', date: due.assemble || '', target: 100, progress: 0 },
        ],
      }
      next.productionPlans.push(pp)
      pushLog(next, `新建生产计划草稿 ${pp.id}`, { soId, module: '生产', billId: pp.id })
    }
    pp.robot = robot
    setState(next)
    return ok('生产计划已建，处于草稿，编辑完记得确认')
  },

  /** 草稿专属：确认后计划只能查看，要改走「变更」 */
  confirmPPPlan(id) {
    const next = structuredClone(state)
    const pp = next.productionPlans.find((p) => p.id === id)
    if (!pp) return fail('生产计划不存在')
    if (pp.done) return fail('已完工，不用再确认')
    if (pp.confirmStatus === 'confirmed') return fail('已经确认过了')
    const miss = (pp.steps || []).filter((s) => pp.robot !== false || s.name !== '机器人').filter((s) => !s.date)
    if (miss.length) return fail(`还有步骤没排计划完成日：${miss.map((s) => s.name).join('、')}`)
    pp.confirmStatus = 'confirmed'
    pp.confirmedAt = now()
    pushLog(next, `确认生产计划 ${id}`, { soId: pp.soId, module: '生产', billId: id })
    setState(next)
    return ok('生产计划已确认。之后只能查看，要改请走「变更」')
  },

  /** 已确认计划的修改入口，必须写变更原因 */
  changePPPlan(id, payload, reason) {
    const next = structuredClone(state)
    const pp = next.productionPlans.find((p) => p.id === id)
    if (!pp) return fail('生产计划不存在')
    if (pp.done) return fail('已完工，须先回退确认完成')
    if (pp.confirmStatus !== 'confirmed') return fail('草稿直接保存就行，不用走变更')
    const why = String(reason || '').trim()
    if (!why) return fail('请填写变更原因')
    pp.robot = !payload.skipRobot
    pp.steps = payload.steps
    pp.changes = pp.changes || []
    pp.changes.unshift({ at: now(), by: '维', reason: why })
    pushLog(next, `变更生产计划 ${id}：${why}`, { soId: pp.soId, module: '生产', billId: id })
    setState(next)
    return ok('生产计划已变更，变更记录已留存')
  },

  /** 把局部生产步骤的时间同步回项目总计划（首页瀑布流口径） */
  syncPlanToFallDue(soId, steps) {
    const next = structuredClone(state)
    const so = next.salesOrders.find((s) => s.id === soId)
    if (!so) return fail('项目不存在')
    so.fallDue = so.fallDue || {}
    let n = 0
    ;(steps || []).forEach((s) => {
      const k = PP_STEP_DUE[s.name]
      if (!k || !s.date) return
      if (String(so.fallDue[k] || '') === String(s.date)) return
      so.fallDue[k] = s.date
      n += 1
    })
    if (!n) return ok('总计划本来就一致，不用同步')
    pushLog(next, `生产计划同步到项目总计划 ${n} 项`, { soId, module: '生产' })
    setState(next)
    return ok(`已把 ${n} 个步骤的时间同步到项目总计划`)
  },

  saveFallPlan(soId, due, skipRobot, reason, opts = {}) {
    const next = structuredClone(state)
    const so = next.salesOrders.find((s) => s.id === soId)
    if (!so || so.confirmStatus !== 'confirmed') return fail('请先确认销售订单')
    const updating = !!so.fallConfirmed
    const need = [
      ['design', '设计'],
      ['bom', 'BOM'],
      ['purchase', '采购'],
      ['inbound', '入库'],
      ['structure', '结构'],
      ['circuit', '电路'],
      ['assemble', '装配'],
      ['outbound', '成品出库'],
      ['install', '安装调试'],
      ['train', '培训'],
    ]
    if (!skipRobot) {
      const i = need.findIndex(([k]) => k === 'assemble')
      need.splice(i, 0, ['robot', '机器人'])
    }
    for (const [k, label] of need) {
      if (!due?.[k]) return fail(`请填写${label}的预计完成日期`)
    }
    const oldDue = so.fallDue || {}
    const changed = need.filter(([k]) => dayOf(oldDue[k]) !== dayOf(due[k]))
    if (updating && changed.length > 0 && !String(reason || '').trim()) return fail('请填写调整原因')
    if (updating && changed.length > 0) {
      next.fallAdjusts = next.fallAdjusts || []
      changed.forEach(([k, label]) => {
        const from = dayOf(oldDue[k])
        const to = dayOf(due[k])
        const risk = (!fallNodeDone(next, soId, k) && fallRisk(next, k, oldDue[k])) || ''
        next.fallAdjusts.unshift({
          id: uid('FA'),
          soId,
          projectName: so.projectName,
          nodeKey: k,
          nodeLabel: label,
          from,
          to,
          reason: String(reason).trim(),
          at: now(),
          by: '维',
          risk,
        })
        // 灯已经亮过就留痕：哪怕后来改了计划，这条记录也留着算绩效
        if (risk) {
          pushLightLog(next, {
            soId,
            nodeKey: k,
            nodeLabel: label,
            tone: risk === 'overdue' ? 'red' : 'yellow',
            planAt: from,
            newPlanAt: to,
            note: `调整计划时该节点已亮${risk === 'overdue' ? '红' : '黄'}灯`,
            by: '维',
          })
        }
      })
    }
    const nextDue = { ...oldDue }
    need.forEach(([k]) => { nextDue[k] = dayOf(due[k]) })
    so.fallDue = nextDue
    // 预计交付日唯一真源 = 里程碑计划的培训节点，改计划时同步写回，避免两处口径打架
    if (nextDue.train) so.dueDate = nextDue.train
    so.fallConfirmed = true
    let pp = next.productionPlans.find((p) => p.soId === soId)
    const stepDate = (k) => String(due[k] || today()).slice(0, 10)
    if (!pp) {
      pp = {
        id: uid('PP'),
        soId,
        done: false,
        progress: 0,
        steps: [
          { name: '结构', date: stepDate('structure'), target: 30, progress: 0 },
          { name: '电路', date: stepDate('circuit'), target: 80, progress: 0 },
          { name: '机器人', date: stepDate('robot') || today(), target: 90, progress: 0 },
          { name: '装配', date: stepDate('assemble'), target: 100, progress: 0 },
        ],
      }
      next.productionPlans.push(pp)
    } else if (opts?.syncProd) {
      // 只有用户明确勾选「同步调整生产计划」才覆盖各步骤日期，否则不动车间排产
      pp.steps = pp.steps.map((s) => {
        const map = { 结构: 'structure', 电路: 'circuit', 机器人: 'robot', 装配: 'assemble' }
        const key = map[s.name]
        return key && due[key] ? { ...s, date: stepDate(key) } : s
      })
    }
    pp.robot = !skipRobot
    pushLog(next, updating ? `变更项目计划${reason ? `：${reason}` : ''}` : '确认项目计划', { soId, module: '销售', billId: soId })
    setState(next)
    return ok(updating ? '瀑布计划已更新' : '瀑布计划已确认')
  },

  punch(soId, progress, rollQty, extra = {}) {
    const next = structuredClone(state)
    const pp = next.productionPlans.find((p) => p.soId === soId)
    if (!pp) return fail('没有生产计划')
    const stepName = extra.step
    if (!stepName) return fail('请选择打卡步骤')
    const st = pp.steps.find((s) => s.name === stepName)
    if (!st) return fail('步骤不存在')
    if (stepName === '机器人' && pp.robot === false) return fail('本单已跳过机器人')
    if (extra.rollRaw === '' || extra.rollRaw == null) return fail('卷材每天必打，没用请填 0')
    const n = Number(progress)
    if (Number.isNaN(n) || n < 0 || n > 100) return fail('进度须在 0 到 100')
    const rollIn = Number(rollQty)
    if (Number.isNaN(rollIn) || rollIn < 0) return fail('卷材用量须为 0 或正数')
    const wire = next.products.find((p) => p.roll) || next.products.find((p) => p.id === 'M004')
    let roll = rollIn
    if (wire?.roll) {
      if (rollIn > 100) return fail('卷材百分比不能超过 100')
      roll = Number(wire.rollInit || 1) * rollIn / 100
    }
    if (extra.overall) {
      pp.progress = n
    } else {
      st.progress = n
      if (n >= 100) st.doneAt = st.doneAt || now()
      else st.doneAt = ''
      const active = pp.robot === false ? pp.steps.filter((s) => s.name !== '机器人') : pp.steps
      pp.progress = Math.round(active.reduce((s, x) => s + (x.progress || 0), 0) / (active.length || 1))
    }
    if (roll > 0) {
      if (!wire) return fail('没有卷材档案')
      if (roll > Number(wire.stock || 0)) return fail(`线材可用 ${wire.stock}，只出可用库存`)
      wire.stock -= roll
      if (wire.roll) normalizeRoll(wire)
      pushLedger(next, { productId: wire.id, qty: roll, dir: 'out', type: '卷材打卡出库', billId: soId, remark: wire.roll ? `打卡用 ${rollIn}% · 现 ${wire.fullRolls} 完整 + ${wire.openRollPct ?? 0}% 开封` : '打卡' })
    }
    const note = String(extra.note || '').trim()
    // 打卡留痕：这一步骤打卡时是否已经亮着灯，留下记录算绩效
    if (st.dueAt) {
      const t0 = delayTone(st.dueAt, reminderOf(next, 'production'))
      if (t0) {
        pushLightLog(next, {
          soId,
          nodeKey: STEP_KEY[stepName] || stepName,
          nodeLabel: stepName,
          tone: t0 === 'overdue' ? 'red' : 'yellow',
          planAt: dayOf(st.dueAt),
          newPlanAt: '',
          note: `打卡 ${n}%（步骤计划 ${dayOf(st.dueAt)}）时已亮${t0 === 'overdue' ? '红' : '黄'}灯`,
          by: extra.by || '维',
        })
      }
    }
    next.punches.unshift({
      id: uid('PK'),
      soId,
      step: stepName,
      progress: n,
      rollQty: roll || 0,
      note: note || (roll ? `卷材出库 ${roll}` : '今日打卡'),
      at: now(),
      by: extra.by || '维',
      photo: extra.photo || '',
    })
    pushLog(next, `生产打卡 ${stepName} ${n}%`, { soId, module: '生产', by: extra.by || '维' })
    setState(next)
    return ok('打卡已提交；卷材有用量则立刻原料出库')
  },

  completePP(soId) {
    const next = structuredClone(state)
    const pp = next.productionPlans.find((p) => p.soId === soId)
    if (!pp) return fail('没有生产计划')
    if (pp.done) return fail('生产已确认完成')
    if (pp.confirmStatus !== 'confirmed') return fail('生产计划还是草稿，请先在列表里确认计划')
    if (next.outboundOrders.some((o) => o.soId === soId)) return fail('已有出库单，勿重复确认完成')
    const bom = next.boms.find((b) => b.soId === soId)
    if (!bom?.confirmed) return fail('请先确认 BOM')
    const so = next.salesOrders.find((s) => s.id === soId)
    const fg = fgOf(next, so)
    if (!fg) return fail('成品档案里没有这个成品，不能入库')
    const qty = Number(bom.qty || 1)
    const t = now()
    pp.done = true
    pp.doneAt = t
    pp.progress = 100
    pp.steps = pp.steps.map((s) => ({ ...s, progress: 100, doneAt: s.doneAt || t }))
    pushLog(next, `确认生产完工，成品「${fg.name}」${qty} 台入库（= 成品入库）`, { soId, module: '生产', billId: pp.id })
    bom.lines.forEach((l) => {
      const p = next.products.find((x) => x.id === l.productId)
      if (p && !p.roll) {
        p.stock -= l.per * bom.qty
        pushLedger(next, { productId: l.productId, qty: l.per * bom.qty, dir: 'out', type: '生产原料出库', billId: pp.id, remark: soId })
      }
    })
    fg.stock += qty
    pushLedger(next, { productId: fg.id, qty, dir: 'in', type: '成品入库', billId: pp.id, remark: soId })
    const outId = uid('OUT')
    next.outboundOrders.push({
      id: outId,
      soId,
      status: 'pending',
      signed: false,
      installed: false,
      trained: false,
      qty,
      remark: '',
    })
    const lackNames = next.products.filter((p) => p.stock < 0).map((p) => p.name)
    if (lackNames.length) pushLackEx(next, soId, lackNames)
    setState(next)
    const inbound = `${so?.productName || fg.name} ${qty} 台已自动入库，并生成待出库单 ${outId}`
    return {
      ...ok(lackNames.length ? `已确认完成（可用不足，已允许负库存并写入缺料异常）。${inbound}` : `已确认完成。${inbound}`),
      outId,
      fgQty: qty,
      fgName: so?.productName || fg.name,
    }
  },

  rollbackPP(soId) {
    const next = structuredClone(state)
    const out = next.outboundOrders.find((o) => o.soId === soId)
    // 后道工序只要动过，就不允许回退完工：必须先把后面关联的单据逐级退回来
    if (out?.trained) return fail('该项目已交付（培训完成）。请先回退培训，再回退安装调试、签收、出库，最后才能回退确认完成')
    if (out?.installed) return fail('该项目已确认安装调试。请先回退安装调试，才能回退确认完成')
    if (out?.signed) return fail('该项目已成品签收。请先回退签收，才能回退确认完成')
    if (out && out.status === 'done') return fail('该项目已出库。请先回退出库单，才能回退确认完成')
    next.outboundOrders = next.outboundOrders.filter((o) => o.soId !== soId)
    const bom = next.boms.find((b) => b.soId === soId)
    const pp = next.productionPlans.find((p) => p.soId === soId)
    if (pp.done && bom) {
      bom.lines.forEach((l) => {
        const p = next.products.find((x) => x.id === l.productId)
        if (p && !p.roll) p.stock += l.per * bom.qty
      })
      const so = next.salesOrders.find((s) => s.id === soId)
      const fg = fgOf(next, so)
      if (fg) fg.stock -= bom.qty
    }
    pp.done = false
    pp.doneAt = ''
    pp.steps = pp.steps.map((s) => {
      const last = next.punches
        .filter((p) => p.soId === soId && p.step === s.name)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0]
      const progress = last?.progress || 0
      return { ...s, progress, doneAt: progress >= 100 ? last.at : '' }
    })
    const active = pp.robot === false ? pp.steps.filter((s) => s.name !== '机器人') : pp.steps
    pp.progress = Math.round(active.reduce((s, x) => s + (x.progress || 0), 0) / (active.length || 1))
    dropLedger(next, pp.id)
    pushLog(next, `回退确认完成（撤销成品入库，待出库出库单已作废）`, { soId, module: '生产', billId: pp.id })
    setState(next)
    return ok('已回退确认完成，待出库出库单已作废，步骤进度已按打卡还原')
  },

  confirmOut(id) {
    const next = structuredClone(state)
    const out = next.outboundOrders.find((o) => o.id === id)
    const so = next.salesOrders.find((s) => s.id === out.soId)
    if (out.closeStatus === 'closed') return fail('出库单已取消，请先回退')
    if (so.closeStatus === 'closed') return fail('订单已取消')
    out.qty = fgNeedQty(next, out.soId)
    if (Number(out.qty || 0) <= 0) return fail('项目台数无效')
    const err = deductFgOut(next, out)
    if (err) return fail(err)
    pushLog(next, `确认销售出库 ${id}：${so.productName} ${out.qty} 台，进入成品出库在途`, { soId: out.soId, module: '出库', billId: id })
    setState(next)
    return ok(`${so.productName} ${out.qty} 台已全部出库，进入成品出库在途`)
  },

  cancelOut(id) {
    const next = structuredClone(state)
    const out = next.outboundOrders.find((o) => o.id === id)
    if (!out) return fail('销售出库单不存在')
    if (out.closeStatus === 'closed') return fail('已经取消')
    if (out.status === 'done') return fail('已出库不能取消，请先回退出库')
    out.closeStatus = 'closed'
    out.cancelledAt = now()
    pushLog(next, `取消销售出库单 ${id}`, { soId: out.soId, module: '出库', billId: id })
    setState(next)
    return ok('销售出库单已取消')
  },

  reopenOut(id) {
    const next = structuredClone(state)
    const out = next.outboundOrders.find((o) => o.id === id)
    if (!out) return fail('销售出库单不存在')
    if (out.closeStatus !== 'closed') return fail('不是已取消状态')
    out.closeStatus = 'open'
    out.cancelledAt = ''
    pushLog(next, `回退销售出库单（撤销取消）${id}`, { soId: out.soId, module: '出库', billId: id })
    setState(next)
    return ok('已回退，回到取消前的状态')
  },

  rollbackOut(id) {
    const next = structuredClone(state)
    const out = next.outboundOrders.find((o) => o.id === id)
    if (out.closeStatus === 'closed') return fail('已取消，请先回退单据')
    if (out.signed) return fail('已签收，须先回退签收')
    if (out.trained || out.installed) return fail('已确认安装或培训，须先回退')
    if (out.status === 'done') {
      const fg = fgOf(next, next.salesOrders.find((s) => s.id === out.soId))
      if (fg) fg.stock += out.qty
      dropLedger(next, out.id)
    }
    out.status = 'pending'
    out.doneAt = ''
    next.abnormals = next.abnormals.filter((a) => a.outId !== id)
    pushLog(next, `回退销售出库 ${id}（成品库存加回）`, { soId: out.soId, module: '出库', billId: id })
    setState(next)
    return ok('出库单回到待出库')
  },

  signOut(id) {
    const next = structuredClone(state)
    const out = next.outboundOrders.find((o) => o.id === id)
    if (out.status !== 'done') return fail('没出库不能签收')
    out.signed = true
    out.signedAt = now()
    pushLog(next, `成品签收 ${id}`, { soId: out.soId, module: '出库', billId: id })
    setState(next)
    return ok('成品签收完成（不形成客户应收）')
  },

  rollbackSign(id) {
    const next = structuredClone(state)
    const out = next.outboundOrders.find((o) => o.id === id)
    if (out.trained) return fail('已确认培训，须先回退培训')
    if (out.installed) return fail('已确认安装调试，须先回退')
    out.signed = false
    pushLog(next, `回退成品签收 ${id}`, { soId: out.soId, module: '出库', billId: id })
    setState(next)
    return ok('已回退签收')
  },

  confirmInstall(id) {
    const next = structuredClone(state)
    const out = next.outboundOrders.find((o) => o.id === id)
    if (!out) return fail('销售出库单不存在')
    if (out.status !== 'done') return fail('请先确认销售出库')
    if (!out.signed) return fail('请先成品签收。办公室可在签收后代点确认安装调试')
    if (out.installed) return fail('已确认安装调试')
    out.installed = true
    out.installedAt = now()
    pushLog(next, `确认安装调试完成 ${id}`, { soId: out.soId, module: '安装调试', billId: id })
    setState(next)
    return ok('已确认安装调试')
  },

  rollbackInstall(id) {
    const next = structuredClone(state)
    const out = next.outboundOrders.find((o) => o.id === id)
    if (!out) return fail('销售出库单不存在')
    if (out.trained) return fail('已确认培训，须先回退培训')
    out.installed = false
    out.installedAt = ''
    pushLog(next, `回退安装调试确认 ${id}`, { soId: out.soId, module: '安装调试', billId: id })
    setState(next)
    return ok('已回退安装调试')
  },

  confirmTrain(id) {
    const next = structuredClone(state)
    const out = next.outboundOrders.find((o) => o.id === id)
    if (!out) return fail('销售出库单不存在')
    if (!out.installed) return fail('请先确认安装调试。办公室可代点')
    if (out.trained) return fail('已确认培训')
    out.trained = true
    out.trainedAt = now()
    pushLog(next, `确认培训完成 ${id}（= 项目交付完成）`, { soId: out.soId, module: '培训', billId: id })
    setState(next)
    return ok('已确认培训完成 = 交付完成')
  },

  rollbackTrain(id) {
    const next = structuredClone(state)
    const out = next.outboundOrders.find((o) => o.id === id)
    if (!out) return fail('销售出库单不存在')
    out.trained = false
    out.trainedAt = ''
    pushLog(next, `回退培训确认 ${id}（项目回到交付中）`, { soId: out.soId, module: '培训', billId: id })
    setState(next)
    return ok('已回退培训确认，项目会回到首页瀑布')
  },

  createSalesAbn(form) {
    const next = structuredClone(state)
    const soId = form.soId
    const so = next.salesOrders.find((s) => s.id === soId)
    if (!so) return fail('请选择项目')
    const qty = fgNeedQty(next, soId)
    if (qty <= 0) return fail('项目台数无效，请先建 BOM')
    const lines = (form.lines || []).filter((l) => (l.productId || l.name) && Number(l.qty) > 0).map((l) => {
      const p = next.products.find((x) => x.id === l.productId)
      return {
        productId: l.productId,
        name: p?.name || l.name || '',
        qty: Number(l.qty),
        note: l.note || '',
      }
    })
    if (!lines.length) return fail('请选择还没有发出的物料，并填写数量')
    const fg = fgOf(next, so)
    if (!fg) return fail('成品档案里没有这个成品，不能出库')
    if (Number(fg.stock || 0) < qty) return fail('成品库存不足，不允许负库存出库。请先完成生产入库后再创建异常出库单')
    let out = next.outboundOrders.find((o) => o.soId === soId)
    let createdOut = false
    if (form.confirm) {
      if (!out) {
        out = {
          id: uid('OUT'),
          soId,
          status: 'pending',
          signed: false,
          installed: false,
          trained: false,
          qty,
          remark: '异常出库',
        }
        next.outboundOrders.unshift(out)
        createdOut = true
      }
      if (out.status !== 'done') {
        out.qty = qty
        const err = deductFgOut(next, out)
        if (err) return fail(err)
      }
    }
    const t = now()
    const remarks = (form.remarks || [])
      .map((n) => ({ at: n.at || t, text: String(n.text || '').trim() }))
      .filter((n) => n.text)
    const one = String(form.remark || '').trim()
    if (one && !remarks.some((n) => n.text === one)) remarks.unshift({ at: t, text: one })
    const row = {
      id: uid('SAO'),
      soId,
      outId: out?.id || '',
      qty,
      productName: so.productName,
      confirmStatus: form.confirm ? 'confirmed' : 'draft',
      confirmedAt: form.confirm ? t : '',
      status: form.confirm ? 'done' : 'pending',
      signed: false,
      closeStatus: 'open',
      at: t,
      remark: remarks[0]?.text || '',
      remarks,
      lines,
      /** 这张普通出库单是本次异常出库带出来的；回退时要一并撤掉 */
      createdOut,
      /** 本次确认是否真的扣过成品库存；回退时据此精确回补 */
      stockDeducted: !!(form.confirm && out && out.status === 'done'),
    }
    next.abnormals.unshift(row)
    pushLog(next, `${form.confirm ? '确认' : '保存'}销售异常出库单 ${row.id}`, { soId, module: '出库', billId: row.id })
    setState(next)
    const msg = form.confirm
      ? `已确认 ${row.id}。${so.productName} ${qty} 台已扣成品库存。未发物料只登记，不改物料库存。`
      : `草稿 ${row.id} 已保存`
    return { ok: true, message: msg, id: row.id }
  },

  confirmSalesAbn(id) {
    const next = structuredClone(state)
    const row = next.abnormals.find((a) => a.id === id)
    if (!row) return fail('销售异常出库单不存在')
    if (row.closeStatus === 'closed') return fail('已取消，请先回退单据')
    if (row.confirmStatus === 'confirmed') return fail('已经确认')
    const so = next.salesOrders.find((s) => s.id === row.soId)
    const qty = Number(row.qty || fgNeedQty(next, row.soId))
    let out = next.outboundOrders.find((o) => o.soId === row.soId)
    let createdOut = false
    if (!out) {
      out = {
        id: uid('OUT'),
        soId: row.soId,
        status: 'pending',
        signed: false,
        installed: false,
        trained: false,
        qty,
        remark: '异常出库',
      }
      next.outboundOrders.unshift(out)
      createdOut = true
    }
    if (out.status !== 'done') {
      out.qty = qty
      const err = deductFgOut(next, out)
      if (err) return fail(err)
    }
    row.outId = out.id
    row.qty = qty
    row.createdOut = createdOut
    row.confirmStatus = 'confirmed'
    row.confirmedAt = now()
    row.status = 'done'
    row.stockDeducted = out.status === 'done'
    pushLog(next, `确认销售异常出库单 ${id}`, { soId: row.soId, module: '出库', billId: id })
    setState(next)
    return ok(`已确认。${so?.productName || ''} ${qty} 台已扣成品库存。未发物料只登记，不改物料库存。可再开一张。`)
  },

  rollbackSalesAbn(id) {
    const next = structuredClone(state)
    const row = next.abnormals.find((a) => a.id === id)
    if (!row) return fail('销售异常出库单不存在')
    if (row.closeStatus === 'closed') return fail('已取消，请先回退单据')
    if (row.confirmStatus === 'confirmed') {
      // 回退确认：把当时扣掉的成品库存原样补回来，避免账面永久少货
      if (row.stockDeducted) {
        const so = next.salesOrders.find((s) => s.id === row.soId)
        const fg = fgOf(next, so)
        const qty = Number(row.qty || 0)
        if (fg && qty > 0) {
          fg.stock += qty
          pushLedger(next, { productId: fg.id, qty, dir: 'in', type: '异常出库回退', billId: row.id, remark: row.soId })
        }
        row.stockDeducted = false
      }
      // 这张出库单是异常出库时带出来的，回退时一并撤掉，避免留一张空出库单
      if (row.createdOut) {
        const o2 = next.outboundOrders.find((o) => o.id === row.outId)
        if (o2 && (o2.signed || o2.installed || o2.trained)) return fail('该项目已签收 / 安装 / 培训，不能回退这张异常出库单')
        next.outboundOrders = next.outboundOrders.filter((o) => o.id !== row.outId)
        row.createdOut = false
        row.outId = ''
      }
      row.confirmStatus = 'draft'
      row.confirmedAt = ''
      row.status = 'pending'
      row.signed = false
      row.signedAt = ''
      pushLog(next, `回退销售异常出库单确认 ${id}`, { soId: row.soId, module: '出库', billId: id })
      setState(next)
      return ok('已回退确认，成品库存已补回')
    }
    next.abnormals = next.abnormals.filter((a) => a.id !== id)
    pushLog(next, `删除销售异常出库单草稿 ${id}`, { soId: row.soId, module: '出库', billId: id })
    setState(next)
    return ok('草稿已删除，不再出现在列表；删除已记入操作记录')
  },

  signAbn(id) {
    const next = structuredClone(state)
    const row = next.abnormals.find((a) => a.id === id)
    if (!row) return fail('销售异常出库单不存在')
    if (row.closeStatus === 'closed') return fail('已取消，不能签收')
    if (row.status !== 'done') return fail('还没出库，不能签收')
    if (row.signed) return fail('已经签收')
    row.signed = true
    row.signedAt = now()
    pushLog(next, `销售异常出库单签收 ${id}`, { soId: row.soId, module: '出库', billId: id })
    setState(next)
    return ok('已签收')
  },

  rollbackSignAbn(id) {
    const next = structuredClone(state)
    const row = next.abnormals.find((a) => a.id === id)
    if (!row) return fail('销售异常出库单不存在')
    if (!row.signed) return fail('还没签收')
    row.signed = false
    row.signedAt = ''
    pushLog(next, `回退销售异常出库单签收 ${id}`, { soId: row.soId, module: '出库', billId: id })
    setState(next)
    return ok('已回退签收')
  },

  cancelAbn(id) {
    const next = structuredClone(state)
    const row = next.abnormals.find((a) => a.id === id)
    if (!row) return fail('销售异常出库单不存在')
    if (row.closeStatus === 'closed') return fail('已经取消')
    if (row.status === 'done') return fail('已出库不能取消，请先回退确认')
    row.closeStatus = 'closed'
    row.cancelledAt = now()
    pushLog(next, `取消销售异常出库单 ${id}`, { soId: row.soId, module: '出库', billId: id })
    setState(next)
    return ok('销售异常出库单已取消')
  },

  reopenAbn(id) {
    const next = structuredClone(state)
    const row = next.abnormals.find((a) => a.id === id)
    if (!row) return fail('销售异常出库单不存在')
    if (row.closeStatus !== 'closed') return fail('不是已取消状态')
    row.closeStatus = 'open'
    row.cancelledAt = ''
    pushLog(next, `回退销售异常出库单（撤销取消）${id}`, { soId: row.soId, module: '出库', billId: id })
    setState(next)
    return ok('已回退，回到取消前的状态')
  },

  abnormalOut(soId, remark) {
    return this.createSalesAbn({
      soId,
      remark,
      confirm: true,
      lines: (state.boms.find((b) => b.soId === soId)?.lines || []).map((l) => ({
        productId: l.productId,
        name: state.products.find((p) => p.id === l.productId)?.name || '',
        qty: Number(l.per || 0) * Number(state.boms.find((b) => b.soId === soId)?.qty || 1),
        pick: true,
      })),
    })
  },

  addAboNote(id, text) {
    const next = structuredClone(state)
    const abo = next.abnormals.find((a) => a.id === id)
    if (!abo) return fail('销售异常出库单不存在')
    const t = String(text || '').trim()
    if (!t) return fail('请填写说明')
    abo.remarks = abo.remarks || []
    abo.remarks.unshift({ at: now(), text: t })
    abo.remark = t
    pushLog(next, `销售异常出库单追加说明 ${id}：${t}`, { soId: abo.soId, module: '出库', billId: id })
    setState(next)
    return ok('已追加说明')
  },

  createOtherIn(form) {
    const next = structuredClone(state)
    const oiRow = {
      id: uid('OI'),
      date: form.date || today(),
      remark: form.remark || '',
      confirmed: false,
      lines: (form.lines || []).filter((l) => l.qty > 0),
    }
    next.othersIn.unshift(oiRow)
    pushLog(next, `新建其他入库单 ${oiRow.id}`, { module: '库存', billId: oiRow.id })
    setState(next)
    return ok('其他入库单已保存，待确认')
  },

  confirmOtherIn(id) {
    const next = structuredClone(state)
    const row = next.othersIn.find((o) => o.id === id)
    if (!row || row.confirmed) return fail('单据不存在或已确认')
    row.confirmed = true
    row.lines.forEach((l) => {
      const p = next.products.find((x) => x.id === l.productId)
      if (p) p.stock += Number(l.qty)
      pushLedger(next, { productId: l.productId, qty: Number(l.qty), dir: 'in', type: '其他入库', billId: id, remark: row.remark })
    })
    pushLog(next, `确认其他入库 ${id}`, { module: '库存', billId: id })
    setState(next)
    return ok('其他入库已确认，进可用，不形成应付')
  },

  rollbackOtherIn(id) {
    const next = structuredClone(state)
    const row = next.othersIn.find((o) => o.id === id)
    if (!row) return fail('单据不存在')
    if (!row.confirmed) {
      next.othersIn = next.othersIn.filter((o) => o.id !== id)
      pushLog(next, `删除其他入库草稿 ${id}`, { module: '库存', billId: id })
      setState(next)
      return ok('草稿已删除，不再出现在列表；删除已记入操作记录')
    }
    // 不允许负库存：回退会把库存扣回去，扣不动就直接拦下来说清楚
    for (const l of row.lines) {
      const p = next.products.find((x) => x.id === l.productId)
      if (p && p.stock - Number(l.qty) < 0) {
        return fail(`不能回退：${p.name} 当前可用只有 ${p.stock}，回退要扣 ${l.qty}，扣完会变负数。请先盘点，或先补入库。`)
      }
    }
    row.lines.forEach((l) => {
      const p = next.products.find((x) => x.id === l.productId)
      if (p) p.stock -= Number(l.qty)
      pushLedger(next, { productId: l.productId, qty: Number(l.qty), dir: 'out', type: '回退其他入库', billId: id, remark: row.remark })
    })
    row.confirmed = false
    pushLog(next, `回退其他入库 ${id}`, { module: '库存', billId: id })
    setState(next)
    return ok('已回退确认，库存扣回')
  },

  otherIn(productId, qty, remark) {
    return actions.createOtherIn({ remark, lines: [{ productId, qty }] })
  },

  adjust(productId, toRepair, qty = 1, reason = '') {
    const next = structuredClone(state)
    const n = Number(qty) || 1
    const p = next.products.find((x) => x.id === productId)
    if (!p) return fail('请选择物料')
    if (toRepair) {
      if (p.stock < n) return fail('可用不足')
      p.stock -= n
      p.repair += n
    } else {
      if (p.repair < n) return fail('在修数量不足')
      p.repair -= n
      p.stock += n
    }
    next.adjusts.unshift({ id: uid('ADJ'), productId, toRepair, qty: n, reason, at: today() })
    pushLedger(next, { productId, qty: n, dir: toRepair ? 'out' : 'in', type: '状态调整', billId: p.id, remark: toRepair ? '可用→在修' : '在修→可用' })
    pushLog(next, `状态调整 ${p.name} ${n}${p.unit}`, { module: '库存' })
    setState(next)
    return ok('状态调整已确认（不进异常）')
  },

  rollbackAdjust(id) {
    const next = structuredClone(state)
    const row = next.adjusts.find((a) => a.id === id)
    if (!row) return fail('调整记录不存在')
    const p = next.products.find((x) => x.id === row.productId)
    if (!p) return fail('物料不存在')
    if (row.toRepair) {
      if (p.repair < row.qty) return fail('在修已不足，不能回退')
      p.repair -= row.qty
      p.stock += row.qty
    } else {
      if (p.stock < row.qty) return fail('可用已不足，不能回退')
      p.stock -= row.qty
      p.repair += row.qty
    }
    next.adjusts = next.adjusts.filter((a) => a.id !== id)
    pushLedger(next, { productId: row.productId, qty: row.qty, dir: row.toRepair ? 'in' : 'out', type: '回退状态调整', billId: id })
    pushLog(next, `回退状态调整 ${id}`, { module: '库存', billId: id })
    setState(next)
    return ok('已回退状态调整')
  },

  /** 其他出库：报废 / 赠送 / 丢失 / 其他。数量可填，必写库存流水，不做回退（填错用盘点调平）。 */
  scrap(productId, qty, reason = '报废', remark = '') {
    const next = structuredClone(state)
    const p = next.products.find((x) => x.id === productId)
    const n = Number(qty)
    if (!p) return fail('物料不存在')
    if (!n || n <= 0) return fail('请填写数量')
    if (p.stock < n) return fail(`可用不足：${p.name} 只有 ${p.stock}${p.unit || ''}，不能出库 ${n}`)
    const rs = String(reason || '报废').trim() || '报废'
    p.stock -= n
    if (rs === '报废') p.scrap += n
    const rk = String(remark || '').trim()
    const row = { id: uid('OTH'), productId, qty: n, reason: rs, remark: rk, at: now(), status: 'done' }
    next.othersOut.unshift(row)
    pushLedger(next, { productId, qty: n, dir: 'out', type: rs === '报废' ? '报废出库' : '其他出库', billId: row.id, remark: rk || rs })
    pushLog(next, `其他出库（${rs}）${p.name} ${n}${p.unit || ''}${rk ? ` · ${rk}` : ''}`, { module: '库存', billId: row.id })
    setState(next)
    return ok(`其他出库（${rs}）已完成：扣减可用、写库存流水。填错可在列表里「回退」。`)
  },

  rollbackScrap(id) {
    const next = structuredClone(state)
    const row = next.othersOut.find((o) => o.id === id)
    if (!row) return fail('其他出库单不存在')
    if (row.status === 'returned') return fail('这张单已经回退过了')
    const p = next.products.find((x) => x.id === row.productId)
    if (!p) return fail('物料不存在')
    p.stock += row.qty
    if ((row.reason || '报废') === '报废') p.scrap = Math.max(0, p.scrap - row.qty)
    pushLedger(next, { productId: row.productId, qty: row.qty, dir: 'in', type: '其他出库回退', billId: id, remark: `回退${row.reason || '报废'}` })
    // 回退不删单：留档并把状态改成「已回退」，随时还能查到
    row.status = 'returned'
    row.returnedAt = now()
    pushLog(next, `回退其他出库（${row.reason || '报废'}）${p.name} ${row.qty}${p.unit || ''}`, { module: '库存', billId: id })
    setState(next)
    return ok('已回退，库存加回可用；这张单保留在列表里显示「已回退」')
  },

  toggleProduct(id) {
    const next = structuredClone(state)
    const p = next.products.find((x) => x.id === id)
    p.status = p.status === 'off' ? 'active' : 'off'
    pushLog(next, `${p.status === 'off' ? '停用' : '启用'}物料「${p.name}」`, { module: '基础资料', billId: id })
    setState(next)
    return ok(p.status === 'off' ? '已停用' : '已启用')
  },

  toggleRow(list, id) {
    const next = structuredClone(state)
    const row = next[list].find((x) => x.id === id)
    if (!row) return fail('记录不存在')
    row.status = row.status === 'off' ? 'active' : 'off'
    pushLog(next, `${row.status === 'off' ? '停用' : '启用'}「${row.name}」`, { module: '基础资料', billId: id })
    setState(next)
    return ok(row.status === 'off' ? '已停用' : '已启用')
  },

  /** 供应商停用：只要有涉及的单据就不许停用 */
  toggleSupplier(id) {
    const next = structuredClone(state)
    const row = next.suppliers.find((x) => x.id === id)
    if (!row) return fail('供应商不存在')
    if (row.status !== 'off') {
      const pos = next.purchaseOrders.filter((p) => p.supplierId === id)
      const inSuggest = (next.suggests || []).some((s) => (s.lines || []).some((l) => l.supplierId === id))
      const buy = (next.boms || []).some((b) => (b.lines || []).some((l) => l.supplierId === id))
      const blocks = []
      if (pos.length) blocks.push(`${pos.length} 张采购订单（${pos.slice(0, 3).map((p) => p.id).join('、')}${pos.length > 3 ? ' 等' : ''}）`)
      if (buy) blocks.push('BOM 里指定了这个供应商')
      if (inSuggest) blocks.push('采购建议里指向了这个供应商')
      if (blocks.length) {
        return fail(`不能停用「${row.name}」：还有 ${blocks.join('、')}。先把这些单据处理掉，或把供应商改成别家，再来停用。`)
      }
    }
    row.status = row.status === 'off' ? 'active' : 'off'
    pushLog(next, `${row.status === 'off' ? '停用' : '启用'}供应商「${row.name}」`, { module: '基础资料' })
    setState(next)
    return ok(row.status === 'off' ? `「${row.name}」已停用` : `「${row.name}」已启用`)
  },

  /** 员工停用：还担着事（提醒人 / 未完结异常 / 未完工项目的打卡）就不许停用 */
  toggleEmployee(id) {
    const next = structuredClone(state)
    const row = next.employees.find((x) => x.id === id)
    if (!row) return fail('员工不存在')
    if (row.status !== 'off') {
      const nodes = (next.ruleCenter?.nodes || []).filter((n) => (n.people || []).includes(id))
      const safety = (next.safetyCfg?.people || []).includes(id)
      const exs = (next.exceptions || []).filter((e) => exOpen(e) && (e.people || []).includes(id))
      const openSoIds = (next.productionPlans || []).filter((p) => !p.done).map((p) => p.soId)
      const busy = (next.punches || []).filter((p) => p.by === row.name && openSoIds.includes(p.soId))
      const blocks = []
      if (nodes.length) blocks.push(`还是 ${nodes.length} 个环节的提醒人（${nodes.slice(0, 3).map((n) => n.label).join('、')}${nodes.length > 3 ? ' 等' : ''}）`)
      if (safety) blocks.push('还是安全库存提醒人')
      if (exs.length) blocks.push(`还有 ${exs.length} 条未完结异常派给了他`)
      if (busy.length) blocks.push(`在未完工的项目上有 ${busy.length} 条打卡记录`)
      if (blocks.length) {
        return fail(`不能停用「${row.name}」：${blocks.join('、')}。请先换个提醒人 / 把异常处理掉 / 等这些项目完工，再来停用。`)
      }
    }
    row.status = row.status === 'off' ? 'active' : 'off'
    pushLog(next, `${row.status === 'off' ? '停用' : '启用'}员工「${row.name}」`, { module: '基础资料' })
    setState(next)
    return ok(row.status === 'off' ? `「${row.name}」已停用` : `「${row.name}」已启用`)
  },

  saveMaster(list, form) {
    if (!String(form.name || '').trim()) return fail('请填写名称')
    const next = structuredClone(state)
    let savedId = form.id || ''
    if (list === 'products' && form.id) {
      const row = next[list].find((x) => x.id === form.id)
      if (!row) return fail('记录不存在')
      if (form.type && form.type !== row.type) return fail('商品类型不许互改')
      Object.assign(row, {
        name: form.name,
        spec: form.spec,
        unit: form.unit,
        safety: Number(form.safety) || 0,
        roll: !!form.roll,
        rollInit: form.roll ? Number(form.rollInit) || 1 : 0,
      })
    } else if (form.id) {
      const row = next[list].find((x) => x.id === form.id)
      if (!row) return fail('记录不存在')
      Object.assign(row, form)
    } else {
      const row = { ...form, id: form.code || uid(list === 'products' ? 'M' : list === 'customers' ? 'C' : list === 'suppliers' ? 'S' : 'E'), status: 'active' }
      if (list === 'products') {
        Object.assign(row, {
          stock: Number(form.stock) || 0,
          repair: 0,
          scrap: 0,
          safety: Number(form.safety) || 0,
          roll: !!form.roll,
          rollInit: form.roll ? Number(form.rollInit) || 1 : 0,
        })
      }
      delete row.code
      next[list].unshift(row)
      savedId = row.id
    }
    pushLog(next, `${form.id ? '修改' : '新增'}${MASTER_LABEL[list] || '基础资料'}「${form.name}」`, { module: '基础资料', billId: savedId })
    setState(next)
    return { ok: true, message: '已保存', id: savedId }
  },

  confirmPlan(soId, plan) {
    const next = structuredClone(state)
    const so = next.salesOrders.find((s) => s.id === soId)
    if (!so) return fail('项目不存在')
    if (so.planConfirmed) return fail('项目计划已确认，须点「变更」才能改')
    const merged = { ...(so.plan || {}), ...plan }
    const need = ['design', 'purchase', 'structure', 'circuit', 'assemble', 'outbound', 'install', 'train']
    for (const k of need) {
      if (!String(merged[k] || '').trim()) return fail('请把项目计划各节点日期填齐后再确认')
    }
    so.plan = merged
    so.planConfirmed = true
    applyPlanToFallDue(next, so, merged)
    pushLog(next, '确认项目计划', { soId, module: '销售' })
    setState(next)
    return ok('项目计划已确认。之后改期请点「项目计划」旁的「变更」。')
  },

  changePlan(soId, plan, notify) {
    const next = structuredClone(state)
    const so = next.salesOrders.find((s) => s.id === soId)
    if (!so) return fail('项目不存在')
    if (!so.planConfirmed) return fail('请先确认项目计划')
    so.plan = { ...(so.plan || {}), ...plan }
    applyPlanToFallDue(next, so, so.plan)
    pushLog(next, '变更项目计划', { soId, module: '销售' })
    if (notify?.on) {
      const ids = notify.people || []
      if (!ids.length) return fail('需要提醒时，请选择提醒谁')
      const names = ids.map((id) => next.employees.find((e) => e.id === id)?.name || id).join('、')
      next.exceptions.unshift({
        id: uid('EXC'),
        process: '计划',
        title: `${so.projectName} 项目计划变更`,
        content: `提醒：${names}。${notify.note || '项目计划已改期，请对照新日期。'}`,
        soId,
        people: ids,
        level: 'yellow',
        doneStatus: 'open',
        closeStatus: 'open',
        createdAt: now(),
        createdBy: '维',
        notes: [],
      })
      pushLog(next, `项目计划变更已通知 ${names}`, { soId, module: '销售' })
      setState(next)
      return ok('已保存变更，并按异常发出提醒')
    }
    setState(next)
    return ok('已保存变更，未发提醒')
  },

  savePlanDates(soId, plan) {
    return this.confirmPlan(soId, plan)
  },

  createPartPO(form) {
    const next = structuredClone(state)
    const p = next.products.find((x) => x.id === form.productId)
    if (!p) return fail('请选择物料')
    if (p.type === '项目料') {
      if (!form.soId) return fail('项目料必须选择尚未完成培训的销售订单')
      const out = next.outboundOrders.find((o) => o.soId === form.soId)
      if (out?.trained) return fail('该销售订单已培训完成，不能再挂本单补件')
    }
    if (p.type !== '常备料' && p.type !== '项目料') return fail('补件只能选项目料或常备料')
    const soId = p.type === '项目料' ? form.soId : ''
    const address = form.address === '客户' ? (form.customAddress || '客户地址') : '本厂'
    const t = now()
    const confirmNow = !!form.confirm
    const supplier = next.suppliers.find((s) => s.id === form.supplierId)
    const po = {
      id: uid('PO'),
      soId,
      supplierId: form.supplierId,
      closeStatus: 'open',
      confirmStatus: confirmNow ? 'confirmed' : 'draft',
      inboundStatus: 'none',
      settlementStatus: 'unpaid',
      shipped: confirmNow && supplier?.type === '网购',
      shippedAt: confirmNow && supplier?.type === '网购' ? t : '',
      address,
      createdAt: t,
      confirmedAt: confirmNow ? t : '',
      eta: plusDays(today(), 7),
      part: true,
      notes: [],
      lines: [{ productId: form.productId, qty: Number(form.qty) || 1, price: Number(form.price) || (p.type === '常备料' ? 2 : 800) }],
    }
    next.purchaseOrders.unshift(po)
    pushLog(next, `补件采购生成 ${po.id}`, { soId, module: '采购', billId: po.id })
    setState(next)
    return ok(`已生成采购订单 ${po.id}（${p.type === '项目料' ? '挂本项目' : '常备料不挂项目'}）`)
  },

  createManualPO(form) {
    const next = structuredClone(state)
    const lines = (form.lines || []).map((l) => ({
      productId: l.productId,
      qty: Number(l.qty) || 0,
      price: Number(l.price) || 0,
    })).filter((l) => l.productId && l.qty > 0)
    if (!lines.length) return fail('请至少填一行物料')
    if (!form.supplierId) return fail('请选择供应商')
    const hasProject = lines.some((l) => next.products.find((p) => p.id === l.productId)?.type === '项目料')
    const allStock = lines.every((l) => next.products.find((p) => p.id === l.productId)?.type === '常备料')
    if (hasProject && !form.soId) return fail('含项目料时必须选择项目')
    const t = now()
    const confirmNow = form.confirm !== false
    const supplier = next.suppliers.find((s) => s.id === form.supplierId)
    const po = {
      id: uid('PO'),
      soId: allStock ? '' : (form.soId || ''),
      supplierId: form.supplierId,
      closeStatus: 'open',
      confirmStatus: confirmNow ? 'confirmed' : 'draft',
      inboundStatus: 'none',
      settlementStatus: 'unpaid',
      shipped: confirmNow && supplier?.type === '网购',
      shippedAt: confirmNow && supplier?.type === '网购' ? t : '',
      address: form.address === '客户' ? (form.customAddress || '客户地址') : '本厂',
      createdAt: t,
      confirmedAt: confirmNow ? t : '',
      eta: form.eta || plusDays(today(), 7),
      confirmEta: form.confirmEta || '',
      manual: true,
      notes: [],
      lines,
    }
    next.purchaseOrders.unshift(po)
    pushLog(next, `新增采购订单 ${po.id}`, { soId: po.soId, module: '采购', billId: po.id })
    setState(next)
    return ok(`已生成采购订单 ${po.id}`)
  },

  confirmCount(lines) {
    const next = structuredClone(state)
    const id = uid('PD')
    let gainStock = 0
    let lossStock = 0
    let gainRepair = 0
    let lossRepair = 0
    const recLines = []
    ;(lines || []).forEach((l) => {
      const p = next.products.find((x) => x.id === l.productId)
      if (!p) return
      if (p.roll) {
        const bookFull = Number(p.fullRolls) || 0
        const bookPct = Number(p.openRollPct) || 0
        const afterFull = Number(l.afterFull) || 0
        const afterPctRaw = l.afterPct === '' || l.afterPct == null ? null : Number(l.afterPct)
        const afterPct = afterPctRaw == null ? 0 : afterPctRaw
        const bookEq = +(bookFull + bookPct / 100).toFixed(4)
        const afterEq = +(afterFull + afterPct / 100).toFixed(4)
        const ds = +(afterEq - bookEq).toFixed(4)
        p.stock = afterEq
        recLines.push({ productId: l.productId, roll: true, bookFull, bookPct, afterFull, afterPct: afterPctRaw == null ? null : afterPct, bookEq, afterEq })
        if (Math.abs(ds) > 0.0001) {
          if (ds > 0) gainStock += 1; else lossStock += 1
          pushLedger(next, {
            productId: l.productId,
            qty: +Math.abs(ds).toFixed(2),
            dir: ds > 0 ? 'in' : 'out',
            type: ds > 0 ? '盘盈' : '盘亏',
            billId: id,
            remark: `卷 账面 ${bookFull} 完整${bookPct ? ' + 1 开封剩' + bookPct + '%' : ''} → 实盘 ${afterFull} 完整${afterPctRaw != null ? ' + 1 开封剩' + afterPct + '%' : ''}`,
          })
        }
        return
      }
      const bookStock = Number(p.stock) || 0
      const bookRepair = Number(p.repair) || 0
      const afterStock = l.afterStock === '' || l.afterStock == null ? 0 : Number(l.afterStock)
      const afterRepair = l.afterRepair === '' || l.afterRepair == null ? 0 : Number(l.afterRepair)
      recLines.push({ productId: l.productId, bookStock, bookRepair, afterStock, afterRepair })
      p.stock = afterStock
      p.repair = afterRepair
      const ds = afterStock - bookStock
      const dr = afterRepair - bookRepair
      if (ds !== 0) {
        if (ds > 0) gainStock += 1
        else lossStock += 1
        pushLedger(next, {
          productId: l.productId,
          qty: Math.abs(ds),
          dir: ds > 0 ? 'in' : 'out',
          type: ds > 0 ? '盘盈' : '盘亏',
          billId: id,
          remark: `可用 账面 ${bookStock} → 实盘 ${afterStock}`,
        })
      }
      if (dr !== 0) {
        if (dr > 0) gainRepair += 1
        else lossRepair += 1
        pushLedger(next, {
          productId: l.productId,
          qty: Math.abs(dr),
          dir: dr > 0 ? 'in' : 'out',
          type: dr > 0 ? '盘盈（在修）' : '盘亏（在修）',
          billId: id,
          remark: `在修 账面 ${bookRepair} → 实盘 ${afterRepair}`,
        })
      }
    })
    next.counts.unshift({
      id,
      at: today(),
      status: 'done',
      createdAt: now(),
      gainStock,
      lossStock,
      gainRepair,
      lossRepair,
      lines: recLines,
    })
    pushLog(next, `盘点 ${id}`, { module: '库存', billId: id })
    setState(next)
    return ok(`${id} 已确认：可用盘盈 ${gainStock} / 盘亏 ${lossStock}，在修盘盈 ${gainRepair} / 盘亏 ${lossRepair}，账面已按实盘调平`)
  },

  /** 回退盘点：库存还原到盘点前的账面值，并撤掉本次盈亏流水 */
  rollbackCount(id) {
    const next = structuredClone(state)
    const row = next.counts.find((c) => c.id === id)
    if (!row) return fail('盘点记录不存在')
    ;(row.lines || []).forEach((l) => {
      const p = next.products.find((x) => x.id === l.productId)
      if (!p) return
      if (l.roll) {
        p.stock = +(Number(l.bookFull || 0) + Number(l.bookPct || 0) / 100).toFixed(4)
        if (p.roll) normalizeRoll(p)
      } else {
        p.stock = Number(l.bookStock || 0)
        p.repair = Number(l.bookRepair || 0)
      }
    })
    dropLedger(next, id)
    next.counts = next.counts.filter((c) => c.id !== id)
    pushLog(next, `回退盘点 ${id}`, { module: '库存', billId: id })
    setState(next)
    return ok('已回退盘点：库存还原到盘点前，盈亏流水一并撤销')
  },

  safetyBuy(productId, qty, supplierId) {
    const next = structuredClone(state)
    const p = next.products.find((x) => x.id === productId)
    if (!p) return fail('物料不存在')
    if (p.type !== '常备料') return fail('安全库存补货只走常备料')
    // 防重复下单：已经有没到货的采购单就不再开新单
    const pending = next.purchaseOrders.filter(
      (po) => po.closeStatus !== 'closed' && po.inboundStatus !== 'all' && (po.lines || []).some((l) => l.productId === productId),
    )
    if (pending.length) {
      return fail(`${p.name} 已经有 ${pending.length} 张没到货的采购单（${pending.map((x) => x.id).join('、')}），不用重复下单。等这批到了再看。`)
    }
    const t = now()
    const sid = supplierId || 'S03'
    const supplier = next.suppliers.find((s) => s.id === sid)
    const poRow = {
      id: uid('PO'),
      soId: '',
      supplierId: sid,
      closeStatus: 'open',
      confirmStatus: 'confirmed',
      inboundStatus: 'none',
      settlementStatus: 'unpaid',
      shipped: supplier?.type === '网购',
      shippedAt: supplier?.type === '网购' ? t : '',
      address: '本厂',
      createdAt: t,
      confirmedAt: t,
      eta: plusDays(today(), 7),
      part: false,
      safety: true,
      notes: [],
      lines: [{ productId, qty: Number(qty) || (p.safety - p.stock), price: 2 }],
    }
    next.purchaseOrders.unshift(poRow)
    pushLog(next, `安全库存补货：${p.name} 生成常备料采购订单 ${poRow.id}`, { module: '采购', billId: poRow.id })
    setState(next)
    return ok('已生成常备料采购订单（不跨项目、不挂销售订单）')
  },

  savePlanSteps(id, payload) {
    const next = structuredClone(state)
    const pp = next.productionPlans.find((p) => p.id === id)
    if (!pp) return fail('计划不存在')
    if (pp.done) return fail('已完工，须先回退确认完成')
    pp.robot = !payload.skipRobot
    pp.steps = payload.steps
    if (!pp.confirmStatus) pp.confirmStatus = 'draft'
    pushLog(next, `保存生产计划草稿 ${id}${payload.skipRobot ? '（跳过机器人步骤）' : ''}`, { soId: pp.soId, module: '生产', billId: id })
    setState(next)
    return ok(payload.skipRobot ? '已保存草稿：本单跳过机器人步骤' : '生产计划草稿已保存，确认后只能查看')
  },

  reportEx(form) {
    const next = structuredClone(state)
    const exRow = {
      id: uid('EXC'),
      process: form.process || '生产',
      category: form.category || '其他',
      title: form.title,
      content: form.content || form.title || '',
      soId: form.soId || '',
      poId: form.poId || '',
      productId: form.productId || '',
      level: form.level || 'yellow',
      people: form.people || [],
      doneStatus: 'open',
      closeStatus: 'open',
      createdAt: now(),
      createdBy: form.createdBy || '维',
      notes: [],
    }
    next.exceptions.unshift(exRow)
    pushLog(next, `提交异常单：${exRow.title}`, { soId: exRow.soId, module: exRow.process, billId: exRow.id })
    setState(next)
    return ok('已提交异常，进入异常中心')
  },

  saveEx(id, form) {
    const next = structuredClone(state)
    const row = next.exceptions.find((e) => e.id === id)
    if (!row) return fail('异常单不存在')
    Object.assign(row, {
      title: form.title,
      content: form.content,
      process: form.process,
      level: form.level,
    })
    pushLog(next, `修改异常单：${form.title}`, { soId: row.soId, module: '异常', billId: id })
    setState(next)
    return ok('异常单已保存')
  },

  addExNote(id, text) {
    const next = structuredClone(state)
    const row = next.exceptions.find((e) => e.id === id)
    if (!row) return fail('异常单不存在')
    const body = String(text || '').trim()
    if (!body) return fail('请先填写处理内容，再点追加')
    row.notes = row.notes || []
    row.notes.unshift({ at: new Date().toISOString().replace('T', ' ').slice(0, 16), by: '维', text: body })
    pushLog(next, `异常单追加处理记录 ${id}：${body}`, { soId: row.soId, module: '异常', billId: id })
    setState(next)
    return ok('已追加处理记录')
  },

  finishEx(id) {
    const next = structuredClone(state)
    const row = next.exceptions.find((e) => e.id === id)
    if (!row) return fail('异常单不存在')
    if (row.closeStatus === 'closed') return fail('已关闭的异常不能完结，请先取消关闭')
    row.doneStatus = 'done'
    row.manualDone = true
    pushLog(next, `异常完结：${row.title}`, { soId: row.soId, module: '异常', billId: id })
    setState(next)
    return ok('异常已完结（业务已处理）')
  },

  closeEx(id) {
    const next = structuredClone(state)
    const row = next.exceptions.find((e) => e.id === id)
    if (!row) return fail('异常单不存在')
    row.closeStatus = 'closed'
    pushLog(next, `关闭异常（关提醒）：${row.title}`, { soId: row.soId, module: '异常', billId: id })
    setState(next)
    return ok('异常已关闭（关掉提醒，不等于处理完成）')
  },

  reopenEx(id) {
    const next = structuredClone(state)
    const row = next.exceptions.find((e) => e.id === id)
    row.closeStatus = 'open'
    row.doneStatus = 'open'
    pushLog(next, `重新打开异常：${row.title}`, { soId: row.soId, module: '异常', billId: id })
    setState(next)
    return ok('已重新打开')
  },

  rollbackFinishEx(id) {
    const next = structuredClone(state)
    const row = next.exceptions.find((e) => e.id === id)
    if (!row) return fail('异常单不存在')
    if (row.doneStatus !== 'done') return fail('当前不是已完结，不用回退')
    row.doneStatus = 'open'
    row.manualDone = false
    pushLog(next, `回退异常完结：${row.title}`, { soId: row.soId, module: '异常', billId: id })
    setState(next)
    return ok('已回退完结，回到待处理')
  },

  rollbackCloseEx(id) {
    const next = structuredClone(state)
    const row = next.exceptions.find((e) => e.id === id)
    if (!row) return fail('异常单不存在')
    if (row.closeStatus !== 'closed') return fail('当前不是已关闭，不用回退')
    row.closeStatus = 'open'
    pushLog(next, `回退异常关闭：${row.title}`, { soId: row.soId, module: '异常', billId: id })
    setState(next)
    return ok('已回退关闭')
  },

  saveRuleCenter(rc) {
    const next = structuredClone(state)
    next.ruleCenter = structuredClone(rc)
    pushLog(next, '修改提醒策略中心', { module: '基础资料' })
    setState(next)
    return ok('提醒规则已保存')
  },

  sendPlanNotice(recipients, payload) {
    const ids = recipients || []
    if (!ids.length) return ok('没有勾选同事，已跳过通知')
    const next = structuredClone(state)
    const t = now()
    const names = ids.map((id) => next.employees.find((e) => e.id === id)?.name || id).join('、')
    next.exceptions.unshift({
      id: uid('EX'),
      process: '计划',
      title: payload.title || '计划变更通知',
      content: `${payload.detail || '计划已确认或调整，请知悉。'}（已通知：${names}）`,
      soId: payload.soId || '',
      level: 'yellow',
      doneStatus: 'open',
      closeStatus: 'open',
      createdAt: t,
      createdBy: '系统',
      notes: [{ at: t, by: '系统', text: `已通知 ${names}` }],
    })
    pushLog(next, `计划通知（${payload.scope || '计划'}）：${payload.title || ''}`, { soId: payload.soId, module: '计划', billId: payload.soId })
    setState(next)
    return ok(`已把这条计划通知作为异常发出，共 ${ids.length} 人`)
  },

  /** 在库存查询页直接改常备料的安全库存 */
  setSafety(productId, value) {
    const next = structuredClone(state)
    const p = next.products.find((x) => x.id === productId)
    if (!p) return fail('物料不存在')
    if (p.type !== '常备料') return fail('只有常备料才有安全库存')
    const before = Number(p.safety) || 0
    const after = Math.max(0, Number(value) || 0)
    if (before === after) return ok(`「${p.name}」安全库存还是 ${after}，没有变化`)
    p.safety = after
    pushLog(next, `安全库存「${p.name}」${before} → ${after}`, { module: '基础资料', billId: p.id })
    setState(next)
    return ok(`「${p.name}」安全库存已设为 ${after}（已写入操作记录）`)
  },

  /** 改交期后，把新日期同步到项目计划的采购节点 */
  syncPoEtaToPlan(poId) {
    const next = structuredClone(state)
    const po = next.purchaseOrders.find((p) => p.id === poId)
    if (!po) return fail('采购订单不存在')
    if (!po.soId) return fail('常备料采购不挂项目，不用同步')
    const so = next.salesOrders.find((s) => s.id === po.soId)
    if (!so) return fail('项目不存在')
    so.fallDue = { ...(so.fallDue || {}), purchase: dayOf(po.eta) }
    if (so.fallDue.train) so.dueDate = so.fallDue.train
    pushLog(next, `采购交期同步到项目计划采购节点（${po.id} → ${dayOf(po.eta)}）`, { soId: po.soId, module: '采购', billId: poId })
    setState(next)
    return ok('已同步到项目计划的采购节点')
  },

  /** 采购订单上可改的字段：供应商确认交期 / 预计付款日 / 送达地址 */
  savePoFields(poId, form) {
    const next = structuredClone(state)
    const po = next.purchaseOrders.find((p) => p.id === poId)
    if (!po) return fail('采购订单不存在')
    if (po.closeStatus === 'closed') return fail('订单已取消，请先回退')
    if (po.inboundStatus !== 'none') return fail('已经有入库了，交期和地址不能再改')
    if (form.eta !== undefined) po.eta = dayOf(form.eta)
    if (form.confirmEta !== undefined) {
      // 交期只认「供应商确认交期」这一个字段；同时写到 eta，保证在途/到货提醒的基准一致
      po.confirmEta = dayOf(form.confirmEta)
      po.eta = dayOf(form.confirmEta)
    }
    if (form.payDue !== undefined) po.payDue = dayOf(form.payDue)
    if (form.address !== undefined) po.address = form.address
    if (form.customAddress !== undefined) po.customAddress = form.customAddress
    pushLog(next, `修改采购订单 ${poId}（确认交期 / 付款日 / 地址）`, { soId: po.soId, module: '采购', billId: poId })
    setState(next)
    return ok('已保存')
  },

  /** 安全库存的提醒人设置（配在库存查询里） */
  setSafetyCfg(patch) {
    const next = structuredClone(state)
    next.safetyCfg = { ...(next.safetyCfg || {}), ...patch }
    pushLog(next, '修改安全库存提醒设置', { module: '基础资料' })
    setState(next)
    return ok('已保存安全库存提醒设置')
  },

  /** 把当前低于安全库存的常备料写进异常中心（带默认通知人），已有未完结的不重复生成 */
  raiseSafetyEx() {
    const next = structuredClone(state)
    const people = (next.safetyCfg?.people || []).filter(Boolean)
    let n = 0
    next.products.filter((p) => p.type === '常备料' && Number(p.safety) > 0).forEach((p) => {
      if (Number(p.stock) >= Number(p.safety)) return
      const open = (next.exceptions || []).some((e) => exOpen(e) && e.process === '库存' && e.productId === p.id)
      if (open) return
      next.exceptions.unshift({
        id: uid('EXC'),
        process: '库存',
        category: '缺料缺货',
        title: `${p.name} 低于安全库存`,
        content: `可用 ${p.stock}，安全库存 ${p.safety}。还没下采购单时每天提醒。`,
        productId: p.id,
        soId: '',
        poId: '',
        level: 'yellow',
        people,
        doneStatus: 'open',
        closeStatus: 'open',
        createdAt: now(),
        createdBy: '系统',
        notes: [],
      })
      n += 1
    })
    if (n) pushLog(next, `安全库存低于阈值，写入 ${n} 条异常`, { module: '库存' })
    setState(next)
    return ok(n ? `已写入 ${n} 条安全库存异常` : '当前没有新的安全库存异常')
  },

  /* ---------- 草稿删除：草稿阶段允许直接删除，且不写操作记录 ---------- */

  deletePoDraft(poId) {
    const next = structuredClone(state)
    const po = next.purchaseOrders.find((p) => p.id === poId)
    if (!po) return fail('采购订单不存在')
    if (po.confirmStatus === 'confirmed') return fail('只有草稿能直接删除；已确认的请走「取消」')
    if (next.inboundOrders.some((x) => x.poId === poId)) return fail('已有入库单，不能删除')
    next.purchaseOrders = next.purchaseOrders.filter((p) => p.id !== poId)
    pushLog(next, `删除采购订单草稿 ${poId}`, { soId: po.soId, module: '采购', billId: poId })
    setState(next)
    return ok(`草稿 ${poId} 已删除，不再出现在列表；删除已记入操作记录`)
  },

  deletePiDraft(id) {
    const next = structuredClone(state)
    const pi = next.inboundOrders.find((p) => p.id === id)
    if (!pi) return fail('入库单不存在')
    if (pi.confirmed) return fail('已确认的入库单不能删除，请走「回退」')
    next.inboundOrders = next.inboundOrders.filter((p) => p.id !== id)
    pushLog(next, `删除采购入库单草稿 ${id}`, { soId: next.purchaseOrders.find((p) => p.id === pi.poId)?.soId || '', module: '采购', billId: id })
    setState(next)
    return ok(`草稿 ${id} 已删除，不再出现在列表；删除已记入操作记录`)
  },

  deletePlanDraft(id) {
    const next = structuredClone(state)
    const pp = next.productionPlans.find((p) => p.id === id)
    if (!pp) return fail('生产计划不存在')
    if (pp.confirmStatus === 'confirmed') return fail('计划已确认，请走「变更」，不能删除')
    if ((next.punches || []).some((x) => x.soId === pp.soId)) return fail('已经有打卡记录，不能删除')
    next.productionPlans = next.productionPlans.filter((p) => p.id !== id)
    pushLog(next, `删除生产计划草稿 ${id}`, { soId: pp.soId, module: '生产', billId: id })
    setState(next)
    return ok('计划草稿已删除，不再出现在列表；删除已记入操作记录')
  },

  deleteBomDraft(soId) {
    const next = structuredClone(state)
    const bom = next.boms.find((b) => b.soId === soId)
    if (!bom) return fail('没有 BOM')
    if (bom.confirmed) return fail('BOM 已确认，不能删除')
    next.boms = next.boms.filter((b) => b.id !== bom.id)
    next.suggests = (next.suggests || []).filter((s) => s.soId !== soId)
    pushLog(next, '删除 BOM 草稿', { soId, module: 'BOM' })
    setState(next)
    return ok('BOM 草稿已删除，不再出现在列表；删除已记入操作记录')
  },
}

function today() {
  return now().slice(0, 10)
}

function plusDays(s, n) {
  const d = new Date(`${dayOf(s || today())}T00:00:00`)
  if (Number.isNaN(d.getTime())) return today()
  d.setDate(d.getDate() + n)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function now() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function stamp(s) {
  const x = String(s || '').trim().replace('T', ' ')
  if (x.length === 10) return `${x} 23:59:59`
  if (x.length === 16) return `${x}:00`
  return x
}

function dayOf(s) {
  return String(s || '').replace('T', ' ').slice(0, 10)
}

function localDay() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const REMIND_KEY = {
  design: 'design',
  bom: 'bom',
  purchase: 'purchaseOrder',
  purchaseOrder: 'purchaseOrder',
  producing: 'supplierProducing',
  supplierProducing: 'supplierProducing',
  transit: 'purchaseTransit',
  purchaseTransit: 'purchaseTransit',
  inbound: 'purchaseTransit',
  structure: 'productionStep',
  circuit: 'productionStep',
  robot: 'productionStep',
  assemble: 'productionStep',
  production: 'productionStep',
  productionStep: 'productionStep',
  outbound: 'outbound',
  install: 'install',
  train: 'train',
  receipt: 'receipt',
  payment: 'payment',
}

/** 没配提醒人时的兜底收件人 */
export const DEFAULT_REMIND_PEOPLE = ['E01']

/** 提醒参数统一从「提醒策略」（ruleCenter）读取，返回结构保持不变，调用方无需改动。 */
export function reminderOf(st, key) {
  const k = REMIND_KEY[key] || key
  const node = (st.ruleCenter?.nodes || []).find((n) => n.key === k)
  const people = (node?.people || []).filter(Boolean)
  return {
    yellowOn: true,
    mode: node?.mode || 'before',
    yellowDays: Number(node?.beforeDays) || 0,
    redDays: Number(node?.redDays) || 0,
    people: people.length ? people : DEFAULT_REMIND_PEOPLE,
    label: node?.label || '',
  }
}

/** tone 计算：
 *  before 模式（默认）：对照计划完成日，到期前 N 天黄灯（maybe），到期当天及以后红灯（overdue）。
 *  after 模式：对照进入/交付日，之后 N 天黄灯，超过 M 天红灯（redDays 缺省则永不自动红，靠手动升级）。
 */
export function delayTone(dueAt, cfg) {
  if (!dueAt) return ''
  const c = cfg || {}
  const y = Number(c.yellowDays) || 0
  const r = Number(c.redDays) || 0
  if ((c.mode || 'before') === 'after') {
    const days = dayDiff(dayOf(dueAt), localDay())
    if (r > 0 && days >= r) return 'overdue'
    if (y > 0 && days >= y) return 'maybe'
    return ''
  }
  const days = dayDiff(localDay(), dayOf(dueAt))
  if (days <= 0) return 'overdue'
  if (y > 0 && days <= y) return 'maybe'
  return ''
}

/** 供应商生产的提醒策略（基础资料 · 提醒策略里的「供应商生产（未发货）」节点） */
export function producePolicy(st) {
  const node = (st.ruleCenter?.nodes || []).find((n) => n.key === 'supplierProducing') || {}
  return {
    startAfter: Number(node.startAfterDays) || 0,
    every: Math.max(1, Number(node.everyDays) || 1),
    label: node.label || '供应商生产（未发货）',
  }
}

/**
 * 供应商生产提醒（频率制，跟提醒策略走）：
 * 1. 采购订单**确认后**即视为进入「供应商生产中」，起算点 = 确认日（不再需要人工「标记开始生产」）；
 * 2. 过了策略里的 startAfterDays 就亮**黄灯**，之后按 everyDays 天一次的节奏提醒；
 * 3. 详情页点「一键升级」后转**红灯**，改成每天提醒；
 * 4. 在采购订单列表点「确认发货」（或完结 / 取消 / 已全部入库 / 网购）就不再提醒。
 * 返回 null 表示当前不该有这条提醒。
 */
export function produceRemind(st, po) {
  if (!po) return null
  if (po.closeStatus === 'closed' || po.completeStatus === 'done') return null
  if (po.confirmStatus !== 'confirmed' || po.inboundStatus === 'all' || po.shipped) return null
  const sup = (st.suppliers || []).find((s) => s.id === po.supplierId)
  if (sup?.type === '网购') return null
  const start = dayOf(po.confirmedAt) || dayOf(po.createdAt)
  if (!start) return null
  const { startAfter, every } = producePolicy(st)
  const red = po.produceRed === true
  const sinceStart = Math.max(0, dayDiff(start, localDay()))
  // 还没到策略里配的「进入后 N 天」：这段由「采购下单」提醒管，这里先不出
  if (!red && sinceStart < startAfter) return null
  const cadence = red ? 1 : every
  return {
    level: red ? 'red' : 'yellow',
    tone: red ? 'overdue' : 'maybe',
    due: true,
    cadence,
    red,
    start,
    sinceStart,
    nextAt: plusDays(localDay(), cadence),
    text: red
      ? `供应商生产已 ${sinceStart} 天未发货，红灯：每天提醒，直到点「确认发货」`
      : `供应商生产已 ${sinceStart} 天未发货，黄灯：每 ${cadence} 天提醒一次`,
  }
}

export function finishKind(dueAt, doneAt, cfg) {
  if (!doneAt) return ''
  if (!dueAt) return 'none'
  if (stamp(doneAt) > stamp(dueAt)) return 'late'
  const days = dayDiff(dayOf(doneAt), dayOf(dueAt))
  if (days <= 0) return 'delay'
  if (cfg?.yellowOn && cfg.yellowDays > 0 && days <= cfg.yellowDays) return 'delay'
  return 'ok'
}

export function finishKindLabel(kind) {
  if (kind === 'late') return '超期完成'
  if (kind === 'delay') return '延期完成'
  if (kind === 'ok') return '正常时间内完成'
  if (kind === 'none') return '没有计划完成日'
  return ''
}

export { now }

function fallRisk(st, key, dueAt) {
  return delayTone(dueAt, reminderOf(st, key))
}

const STEP_KEY = { 结构: 'structure', 电路: 'circuit', 机器人: 'robot', 装配: 'assemble' }

function dayDiff(from, to) {
  const a = Date.parse(`${dayOf(from)}T00:00:00`)
  const b = Date.parse(`${dayOf(to)}T00:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86400000)
}

function dueAtTime(st, soId, key, at) {
  const rows = (st.fallAdjusts || [])
    .filter((a) => a.soId === soId && a.nodeKey === key)
    .sort((a, b) => (String(a.at) > String(b.at) ? 1 : -1))
  if (rows.length) {
    let due = dayOf(rows[0].from)
    rows.forEach((a) => {
      if (String(a.at) <= String(at)) due = dayOf(a.to)
    })
    return due
  }
  const so = st.salesOrders.find((s) => s.id === soId)
  if (so?.fallDue?.[key]) return dayOf(so.fallDue[key])
  const name = { structure: '结构', circuit: '电路', robot: '机器人', assemble: '装配' }[key]
  const pp = st.productionPlans.find((p) => p.soId === soId)
  return dayOf(pp?.steps?.find((s) => s.name === name)?.date)
}

function stepStartDay(st, soId, step) {
  const days = st.punches
    .filter((p) => p.soId === soId && p.step === step)
    .map((p) => dayOf(p.at))
    .filter(Boolean)
    .sort()
  return days[0] || ''
}

function expectedPct(start, due, day) {
  if (!start || !due || !day) return 0
  const total = dayDiff(start, due)
  if (total <= 0) return 100
  const elapsed = dayDiff(start, day)
  if (elapsed <= 0) return 0
  if (elapsed >= total) return 100
  return Math.round((elapsed / total) * 100)
}

/** 生产四步灯：统一「步骤计划日 + 目标进度」口径，电脑端与平板共用同一函数。
 *  某步没做完、且整单进度还没到该步目标进度时，按该步计划日算灯；取最差一档。 */
export function prodRiskTone(st, plan) {
  if (!plan || plan.done) return ''
  const cfg = reminderOf(st, 'production')
  const overall = Number(plan.progress) || 0
  const names = plan.robot === false ? ['结构', '电路', '装配'] : ['结构', '电路', '机器人', '装配']
  let worst = ''
  for (const name of names) {
    const step = (plan.steps || []).find((s) => s.name === name)
    if (!step?.date) continue
    if ((step.progress || 0) >= 100) continue
    if (overall >= Number(step.target || 0)) continue
    const tone = delayTone(step.date, cfg)
    if (tone === 'overdue') return 'overdue'
    if (tone === 'maybe') worst = 'maybe'
  }
  return worst
}

/** 完工前的原料差额：可用 < 需求的行。用于确认完工前弹窗提示，而不是事后才写异常。 */
export function ppShortage(st, soId) {
  const bom = (st.boms || []).find((b) => b.soId === soId && b.confirmed)
  if (!bom) return []
  const rows = []
  ;(bom.lines || []).forEach((l) => {
    const p = (st.products || []).find((x) => x.id === l.productId)
    if (!p || p.roll) return
    const need = Number(l.per || 0) * Number(bom.qty || 1)
    const have = Number(p.stock || 0)
    if (have < need) rows.push({ productId: p.id, name: p.name, unit: p.unit || '', need, have, short: +(need - have).toFixed(2) })
  })
  return rows
}

export function punchRisk(st, punch) {
  const key = STEP_KEY[punch.step]
  if (!key) return ''
  const due = dueAtTime(st, punch.soId, key, punch.at)
  if (!due) return ''
  const p = Number(punch.progress) || 0
  const punchDay = dayOf(punch.at)
  const dueDay = dayOf(due)
  const archived = !!st.outboundOrders.find((o) => o.soId === punch.soId)?.trained
  if (archived) {
    if (p >= 100 && dayDiff(dueDay, punchDay) > 0) return 'late'
    return ''
  }
  if (p >= 100) return dayDiff(dueDay, punchDay) > 0 ? 'late' : ''
  if (dayDiff(dueDay, punchDay) >= 0) return 'overdue'
  const start = stepStartDay(st, punch.soId, punch.step)
  const expected = expectedPct(start, dueDay, punchDay)
  if (p < expected) return 'overdue'
  const cfg = reminderOf(st, key)
  const left = dayDiff(punchDay, dueDay)
  if (cfg.yellowOn && cfg.yellowDays > 0 && left > 0 && left <= cfg.yellowDays) return 'maybe'
  return ''
}

function fallNodeDone(st, soId, key) {
  const des = st.designTasks.find((d) => d.soId === soId)
  const bom = st.boms.find((b) => b.soId === soId)
  const pos = st.purchaseOrders.filter((p) => p.soId === soId)
  const pp = st.productionPlans.find((p) => p.soId === soId)
  const out = st.outboundOrders.find((o) => o.soId === soId)
  const stepDone = (name) => !!pp && (pp.done || (pp.steps.find((s) => s.name === name)?.progress || 0) >= 100)
  const main = pos.filter((p) => !p.part)
  if (key === 'design') return !!des?.done
  if (key === 'bom') return !!bom?.confirmed
  if (key === 'purchase') return main.length > 0 && main.every((p) => p.inboundStatus === 'all')
  if (key === 'transit' || key === 'inbound') return main.length > 0 && main.every((p) => p.inboundStatus === 'all')
  if (key === 'structure') return stepDone('结构')
  if (key === 'circuit') return stepDone('电路')
  if (key === 'robot') return stepDone('机器人')
  if (key === 'assemble') return stepDone('装配')
  if (key === 'outbound') return out?.status === 'done'
  if (key === 'install') return !!out?.installed
  if (key === 'train') return !!out?.trained
  return false
}

function applyPlanToFallDue(next, so, plan) {
  const labels = {
    design: '设计',
    bom: 'BOM 确认',
    purchase: '采购',
    structure: '结构',
    circuit: '电路',
    robot: '机器人',
    assemble: '装配',
    outbound: '成品出库',
    install: '安装调试',
    train: '培训',
  }
  const oldDue = so.fallDue || {}
  const nextDue = { ...oldDue }
  const changed = []
  Object.entries(labels).forEach(([k, label]) => {
    const to = dayOf(plan[k])
    if (!to) return
    const from = dayOf(oldDue[k])
    if (from !== to) {
      nextDue[k] = to
      changed.push({ k, label, from, to })
    }
  })
  so.fallDue = nextDue
  if (nextDue.train) so.dueDate = nextDue.train
  if (so.fallConfirmed && changed.length) {
    next.fallAdjusts = next.fallAdjusts || []
    changed.forEach((c) => {
      next.fallAdjusts.unshift({
        id: uid('FA'),
        soId: so.id,
        projectName: so.projectName,
        nodeKey: c.k,
        nodeLabel: c.label,
        from: c.from,
        to: c.to,
        reason: '项目计划变更',
        at: now(),
        by: '维',
        risk: (!fallNodeDone(next, so.id, c.k) && fallRisk(next, c.k, c.from)) || '',
      })
      const rk = (!fallNodeDone(next, so.id, c.k) && fallRisk(next, c.k, c.from)) || ''
      if (rk) {
        pushLightLog(next, {
          soId: so.id,
          nodeKey: c.k,
          nodeLabel: c.label,
          tone: rk === 'overdue' ? 'red' : 'yellow',
          planAt: c.from,
          newPlanAt: c.to,
          note: `子计划改动时该节点已亮${rk === 'overdue' ? '红' : '黄'}灯`,
          by: '维',
        })
      }
    })
  }
  const pp = next.productionPlans.find((p) => p.soId === so.id)
  if (!pp) return
  pp.steps = pp.steps.map((s) => {
    const map = { 结构: 'structure', 电路: 'circuit', 机器人: 'robot', 装配: 'assemble' }
    const key = map[s.name]
    return key && nextDue[key] ? { ...s, date: String(nextDue[key]).slice(0, 10) } : s
  })
}

export function unpaidOf(po) {
  return poDue(po).total
}

/**
 * 某张采购订单的应付拆分。
 * 口径：**应付 = 采购订单「实际入库数量」× 订单行单价**（不是下单量；没入库就没应付）。
 * 一张单里可能既有项目料又有常备料，付款按「订单维度」登记，
 * 核销顺序是**先冲项目料，冲完多余的算到常备料**。
 * 返回 { proj, stock, recv, paid, projPaid, stockPaid, projUnpaid, stockUnpaid, total, kinds }
 */
export function poDue(po, st = state) {
  const order = po || {}
  const inbound = (st.inboundOrders || []).filter((p) => p.poId === order.id && p.confirmed)
  const recv = { 项目料: 0, 常备料: 0 }
  inbound.forEach((pi) => (pi.lines || []).forEach((l) => {
    const price = (order.lines || []).find((x) => x.productId === l.productId)?.price || 0
    const isStock = st.products.find((p) => p.id === l.productId)?.type === '常备料'
    recv[isStock ? '常备料' : '项目料'] += price * Number(l.qty || 0)
  }))
  // 退货出库即冲减应付（不再需要「对方签收」那一步）；回退出库后自动加回来
  ;(st.returnOuts || [])
    .filter((o) => o.poId === order.id && o.status === 'done' && o.closeStatus !== 'closed')
    .forEach((ro) => (ro.lines || []).forEach((l) => {
      const price = (order.lines || []).find((x) => x.productId === l.productId)?.price || 0
      const isStock = st.products.find((p) => p.id === l.productId)?.type === '常备料'
      recv[isStock ? '常备料' : '项目料'] -= price * Number(l.qty || 0)
    }))
  const proj = Math.max(0, recv['项目料'])
  const stock = Math.max(0, recv['常备料'])
  const paid = paidOfPo(st, order.id)
  const projPaid = Math.min(paid, proj)
  const stockPaid = Math.max(0, paid - proj)
  const projUnpaid = Math.max(0, proj - projPaid)
  const stockUnpaid = Math.max(0, stock - stockPaid)
  const kinds = []
  if (proj > 0) kinds.push('项目料')
  if (stock > 0) kinds.push('常备料')
  return {
    proj,
    stock,
    recv: proj + stock,
    paid,
    projPaid,
    stockPaid,
    projUnpaid,
    stockUnpaid,
    total: projUnpaid + stockUnpaid,
    kinds,
  }
}

/** 某张采购退货出库单冲减的应付金额（采购订单行单价 × 退货数量） */
export function returnOutAmount(ro, st = state) {
  const po = (st.purchaseOrders || []).find((p) => p.id === ro?.poId)
  if (!po) return 0
  return (ro.lines || []).reduce((s, l) => {
    const price = (po.lines || []).find((x) => x.productId === l.productId)?.price || 0
    return s + price * Number(l.qty || 0)
  }, 0)
}

/** 结算状态：由「实际入库金额 vs 已付」实时推导，不看存的值，避免和历史种子数据打架 */
export function poSettle(po, st = state) {
  const d = poDue(po, st)
  if (d.recv <= 0) return 'none'
  if (d.total <= 0) return 'all'
  return d.paid > 0 ? 'partial' : 'unpaid'
}

/* ========================= 付款单 / 收款单 ========================= */

/** 单号：PAY-{年}-{3位} / RC-{年}-{3位}（对照 05-单据分层与编码规则） */
function nextBillId(list, prefix) {
  const nums = (list || [])
    .map((b) => String(b.id || '').match(new RegExp(`^${prefix}-(\\d{4})-(\\d+)$`)))
    .filter(Boolean)
    .map((m) => Number(m[2]))
  const y = String(new Date().getFullYear())
  return `${prefix}-${y}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
}

/**
 * 每个**已确认的采购订单**自动生成一张付款单；每个**未取消的销售订单**自动生成一张收款单。
 * 幂等：已存在的单据不动，只补缺的。任何动作提交时（setState）自动跑一遍。
 */
function ensureBills(next) {
  if (!next) return
  if (!Array.isArray(next.payBills)) next.payBills = []
  if (!Array.isArray(next.rcvBills)) next.rcvBills = []
  ;(next.purchaseOrders || []).forEach((po) => {
    if (po.confirmStatus !== 'confirmed') return
    if (next.payBills.some((b) => b.poId === po.id)) return
    next.payBills.push({
      id: nextBillId(next.payBills, 'PAY'),
      poId: po.id,
      soId: po.soId || '',
      supplierId: po.supplierId,
      date: dayOf(po.confirmedAt) || today(),
      remark: '',
      createdAt: now(),
      settles: [],
    })
  })
  ;(next.salesOrders || []).forEach((so) => {
    // 与采购一致：订单确认（合同生效）后才生成收款单；已取消的不生成
    if (so.confirmStatus !== 'confirmed' || so.closeStatus === 'closed') return
    if (next.rcvBills.some((b) => b.soId === so.id)) return
    next.rcvBills.push({
      id: nextBillId(next.rcvBills, 'RC'),
      soId: so.id,
      customerId: so.customerId,
      date: dayOf(so.createdAt) || today(),
      remark: '',
      createdAt: now(),
      settles: [],
    })
  })
}

/** 单据状态 key：none(无应付/无应收) / open(待付款) / part(部分付款) / all(已付清) */
export function billStatus(due) {
  if (due.total <= 0) return due.paid > 0 ? 'all' : 'none'
  if (due.paid <= 0) return 'open'
  if (due.paid >= due.total) return 'all'
  return 'part'
}

const BILL_LABEL = {
  pay: { none: '无应付', open: '待付款', part: '部分付款', all: '已付清' },
  rcv: { none: '无应收', open: '待收款', part: '部分收款', all: '已收清' },
}
export function billStatusLabel(k, kind = 'pay') {
  return (BILL_LABEL[kind] || BILL_LABEL.pay)[k] || k
}

/** 付款单应付：系统应付（= 实际入库数量 × 单价）+ Σ调整 */
export function payBillDue(bill, st = state) {
  const po = (st.purchaseOrders || []).find((p) => p.id === bill?.poId) || {}
  const d = poDue(po, st)
  const settles = bill?.settles || []
  const adjust = settles.reduce((s, x) => s + Number(x.adjust || 0), 0)
  const paid = settles.reduce((s, x) => s + Number(x.amount || 0), 0)
  const total = d.recv + adjust
  return { base: d.recv, adjust, paid, total, unpaid: Math.max(0, total - paid), proj: d.proj, stock: d.stock }
}

/** 收款单应收：合同额 + Σ调整 */
export function rcvBillDue(bill, st = state) {
  const so = (st.salesOrders || []).find((s) => s.id === bill?.soId) || {}
  const settles = bill?.settles || []
  const base = Number(so.amount || 0)
  const adjust = settles.reduce((s, x) => s + Number(x.adjust || 0), 0)
  const paid = settles.reduce((s, x) => s + Number(x.amount || 0), 0)
  const total = base + adjust
  return { base, adjust, paid, total, unpaid: Math.max(0, total - paid) }
}

export function payBillOf(st, poId) {
  return (st.payBills || []).find((b) => b.poId === poId)
}
export function rcvBillOf(st, soId) {
  return (st.rcvBills || []).find((b) => b.soId === soId)
}

/** 某张采购订单已经付掉的钱（付款单上所有实付之和） */
function paidOfPo(st, poId) {
  const bill = (st.payBills || []).find((b) => b.poId === poId)
  return (bill?.settles || []).reduce((s, x) => s + Number(x.amount || 0), 0)
}
/** 某个销售订单已经收到的钱（收款单上所有实收之和） */
function gotOfSo(st, soId) {
  const bill = (st.rcvBills || []).find((b) => b.soId === soId)
  return (bill?.settles || []).reduce((s, x) => s + Number(x.amount || 0), 0)
}

export function receivedOf(so, st = state) {
  return gotOfSo(st, so?.id)
}

/** 草稿/已确认，且下游一份都没有（含 BOM 草稿）时才可取消；有草稿的要先删草稿 */
export function soCanCancel(st, so) {
  if (!so || so.closeStatus === 'closed') return false
  if (so.confirmStatus !== 'draft' && so.confirmStatus !== 'confirmed') return false
  if ((st.boms || []).some((b) => b.soId === so.id)) return false
  if ((st.purchaseOrders || []).some((p) => p.soId === so.id)) return false
  return true
}

/** 「提醒环节 → 提醒策略节点 key」，取该环节默认提醒人用 */
const AUTO_REMIND_KEY = {
  设计: 'design',
  BOM: 'bom',
  采购下单: 'purchaseOrder',
  采购在途: 'purchaseTransit',
  供应商生产: 'supplierProducing',
  生产: 'productionStep',
  出库: 'outbound',
  安装调试: 'install',
  培训: 'train',
  收款: 'receipt',
  付款: 'payment',
}

/**
 * 把「系统实时提醒」落成真正的异常（auto: true），这样首页/异常中心每条都有详情页可点、可写处理意见。
 * - 按 srcKey 幂等：同一条提醒不会重复生成；
 * - **不自动完结、不自动重开**：异常一旦生成就留在这儿，必须由人手动「完结」才会从首页消失（老崔口径）；
 * - 常备料采购（不挂项目）的在途/下单/付款提醒同样生成，只是分组落到「未挂项目（库存等）」。
 */
function syncAutoExceptions(next) {
  if (!next || !next.exceptions) return
  const live = liveReminders(next)
  // 当前"应该存在"的提醒 key 集合。安全库存不挂在 liveReminders 上，单独补进来，
  // 否则下面那轮反向同步会把它刚生成的异常立刻自动删掉。
  const liveKeys = new Set(live.map((l) => `AUTO|${l.soId || ''}|${l.module}|${l.title}`))
  ;(next.products || [])
    .filter((p) => p.type === '常备料' && Number(p.safety) > 0 && Number(p.stock) < Number(p.safety))
    .forEach((p) => liveKeys.add(`AUTO-SAFETY|${p.id}`))

  live.forEach((l) => {
    const srcKey = `AUTO|${l.soId || ''}|${l.module}|${l.title}`
    const level = l.level === '红灯' ? 'red' : 'yellow'
    // 已经生成过（含已被人手动完结 / 关闭的）就不再重复生成、也不自动重开
    const hit = next.exceptions.find((e) => e.auto && e.srcKey === srcKey)
    if (hit) {
      if (hit.level !== level && hit.doneStatus !== 'done' && hit.closeStatus !== 'closed') hit.level = level
      return
    }
    next.exceptions.unshift({
      id: uid('EXC'),
      auto: true,
      srcKey,
      process: l.module,
      category: '其他',
      title: l.title,
      content: '系统按「提醒策略」实时算出并生成；处理完成后请手动「完结」。',
      soId: l.soId || '',
      poId: '',
      productId: '',
      level,
      people: reminderOf(next, AUTO_REMIND_KEY[l.module] || '').people,
      doneStatus: 'open',
      closeStatus: 'open',
      createdAt: now(),
      createdBy: '系统',
      notes: [],
    })
  })

  // 反向同步：来源提醒已经消失的（采购单发货了 / 生产完工了 / 款收清了 / 补货到货了），
  // 把系统自动生成的异常**自动完结**，并摘掉 srcKey —— 留档可查，将来同样情况再出现还能重新生成一条。
  // 以前只加不减，会出现"货都发了，异常中心还挂着一条供应商生产红灯"。
  next.exceptions.forEach((e) => {
    if (!e.auto || !e.srcKey || liveKeys.has(e.srcKey)) return
    const wasOpen = e.closeStatus !== 'closed' && e.doneStatus !== 'done'
    e.doneStatus = 'done'
    e.autoClosed = true
    if (wasOpen) {
      e.notes = e.notes || []
      e.notes.unshift({ at: now(), by: '系统', text: '来源提醒已消失（已发货 / 已处理完成），系统自动完结' })
      pushLog(next, `来源提醒已消失，自动完结异常：${e.title}`, { soId: e.soId, module: e.process, type: '系统触发' })
    }
    e.srcKey = ''
  })

  // 安全库存：常备料可用低于安全库存 → 自动进异常中心；提醒人取「安全库存设置」里配的人，没配就用默认。
  // 与上面同一套去重口径：已经有对应异常（含被人完结 / 关闭的）就不再重复生成、也不自动重开。
  const safetyPeople = (next.safetyCfg?.people || []).filter(Boolean)
  ;(next.products || [])
    .filter((p) => p.type === '常备料' && Number(p.safety) > 0 && Number(p.stock) < Number(p.safety))
    .forEach((p) => {
      const srcKey = `AUTO-SAFETY|${p.id}`
      const hit = next.exceptions.find((e) => e.srcKey === srcKey)
        || next.exceptions.find((e) => e.productId === p.id && ['库存', '安全库存'].includes(e.process))
      if (hit) {
        if (!hit.srcKey) hit.srcKey = srcKey
        if (exOpen(hit)) hit.content = `可用 ${p.stock}${p.unit || ''}，安全库存 ${p.safety}${p.unit || ''}。低于安全库存会自动进这里，并提醒设置里的人。`
        return
      }
      next.exceptions.unshift({
        id: uid('EXC'),
        auto: true,
        srcKey,
        process: '库存',
        category: '缺料缺货',
        title: `${p.name} 低于安全库存`,
        content: `可用 ${p.stock}${p.unit || ''}，安全库存 ${p.safety}${p.unit || ''}。低于安全库存会自动进这里，并提醒设置里的人。`,
        productId: p.id,
        soId: '',
        poId: '',
        level: 'yellow',
        people: safetyPeople,
        doneStatus: 'open',
        closeStatus: 'open',
        createdAt: now(),
        createdBy: '系统',
        notes: [],
      })
    })
}

export function liveReminders(st) {
  const rows = []
  function add(soId, module, title, tone, projectName) {
    if (!tone) return
    rows.push({
      id: `RM-${soId || module}-${title}`,
      at: localDay(),
      type: '系统提醒',
      by: '系统',
      module,
      soId: soId || '',
      projectName: projectName || '',
      title,
      level: tone === 'overdue' ? '红灯' : '黄灯',
    })
  }
  st.salesOrders.filter((s) => s.confirmStatus === 'confirmed' && s.closeStatus === 'open').forEach((so) => {
    const due = so.fallDue || so.plan || {}
    const des = st.designTasks.find((d) => d.soId === so.id)
    if (!des?.done) add(so.id, '设计', `${so.projectName} · 设计未完成`, delayTone(due.design, reminderOf(st, 'design')), so.projectName)
    const bom = st.boms.find((b) => b.soId === so.id)
    if (!bom?.confirmed) add(so.id, 'BOM', `${so.projectName} · BOM 未确认`, delayTone(due.bom, reminderOf(st, 'bom')), so.projectName)
    const out = st.outboundOrders.find((o) => o.soId === so.id)
    if (!out || out.status !== 'done') add(so.id, '出库', `${so.projectName} · 成品未出库`, delayTone(due.outbound, reminderOf(st, 'outbound')), so.projectName)
    if (out?.signed && !out.installed) add(so.id, '安装调试', `${so.projectName} · 安装调试未确认`, delayTone(due.install, reminderOf(st, 'install')), so.projectName)
    if (out?.installed && !out.trained) add(so.id, '培训', `${so.projectName} · 培训未确认`, delayTone(due.train, reminderOf(st, 'train')), so.projectName)
    // 收款提醒：以交付日（培训完成）起算，交付后 yellowDays 黄灯，超过 redDays 红灯
    const rec = receivedOf(so)
    const base = out?.trainedAt
    if (base && rec < Number(so.amount || 0)) {
      const days = dayDiff(dayOf(base), localDay())
      add(so.id, '收款', `${so.projectName} · 已交付 ${days} 天未收清`, delayTone(base, reminderOf(st, 'receipt')), so.projectName)
    }
    const pp = st.productionPlans.find((p) => p.soId === so.id)
    if (!pp?.done) {
      ;[['structure', '结构'], ['circuit', '电路'], ['robot', '机器人'], ['assemble', '装配']].forEach(([key, name]) => {
        if (pp?.robot === false && key === 'robot') return
        if (fallNodeDone(st, so.id, key)) return
        const stepDue = due[key] || pp?.steps?.find((s) => s.name === name)?.date
        add(so.id, '生产', `${so.projectName} · ${name}未完成`, delayTone(stepDue, reminderOf(st, 'production')), so.projectName)
      })
    }
  })
  // 采购相关：下单 / 供应商生产 / 在途 / 付款
  st.purchaseOrders.filter((p) => p.confirmStatus === 'confirmed' && p.closeStatus !== 'closed' && p.completeStatus !== 'done').forEach((po) => {
    if (po.inboundStatus === 'all') return
    const so = st.salesOrders.find((s) => s.id === po.soId)
    const proj = so?.projectName || (po.soId ? po.soId : '库存采购')
    const due = po.confirmEta || po.eta
    const sup = st.suppliers.find((s) => s.id === po.supplierId)
    const isOnline = sup?.type === '网购'
    if (po.shipped || isOnline) {
      // 采购在途：到约定交期还没全部入库就提醒（入库提醒已并入本项）
      add(po.soId || '', '采购在途', `${po.id} 已发货未入完`, delayTone(due, reminderOf(st, 'transit')), proj)
    } else {
      // 供应商生产：采购订单确认后即进入生产阶段，过了策略配的起始天数就亮黄灯（节奏写在文案里）；
      // 一键升级后红灯每天提醒。没到起始天数这段由「采购下单」管，对照约定交期。
      const pr = produceRemind(st, po)
      if (pr) {
        add(po.soId || '', '供应商生产', `${po.id} · ${pr.text}`, pr.tone, proj, { poId: po.id })
      } else {
        add(po.soId || '', '采购下单', `${po.id} 供应商尚未开始生产 / 发货`, delayTone(due, reminderOf(st, 'purchase')), proj)
      }
    }
    // 付款提醒：对照预计付款日
    const inbound = st.inboundOrders.filter((p) => p.poId === po.id && p.confirmed)
    const ap = inbound.reduce((s, pi) => s + pi.lines.reduce((a, l) => a + (po.lines.find((x) => x.productId === l.productId)?.price || 0) * l.qty, 0), 0)
    const bill = (st.payBills || []).find((b) => b.poId === po.id)
    const adjust = (bill?.settles || []).reduce((s, x) => s + Number(x.adjust || 0), 0)
    const paid = paidOfPo(st, po.id)
    const unpaid = Math.max(0, ap + adjust - paid)
    if (unpaid > 0 && po.payDue) {
      add(po.soId || '', '付款', `${po.id} 应付 ¥${unpaid} 未付（预计 ${po.payDue} 付款）`, delayTone(po.payDue, reminderOf(st, 'payment')), proj)
    }
  })
  return rows
}

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const snapshot = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getState,
    getState
  )
  const value = useMemo(() => ({ state: snapshot, actions }), [snapshot])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  return useContext(StoreContext)
}

/** 黄灯 / 红灯历史留痕（算绩效用）：改计划、重新打卡都不抹掉已经亮过的灯 */
function pushLightLog(next, row) {
  next.lightLogs = next.lightLogs || []
  next.lightLogs.unshift({
    id: uid('LL'),
    at: now(),
    soId: row.soId || '',
    nodeKey: row.nodeKey || '',
    nodeLabel: row.nodeLabel || '',
    tone: row.tone || 'yellow',
    planAt: row.planAt || '',
    newPlanAt: row.newPlanAt || '',
    note: row.note || '',
    by: row.by || '系统',
  })
}

/** 某个项目（可选某个节点）的亮灯历史 */
export function lightLogsOf(st, soId, nodeKey) {
  return (st.lightLogs || []).filter((l) => l.soId === soId && (!nodeKey || l.nodeKey === nodeKey))
}

/** 异常「环节」枚举：全系统共用，与《模块规划V6》一致 */
export const EX_PROCESS = ['设计', 'BOM', '采购', '生产', '出库', '安装调试', '回款', '库存']

/**
 * 异常「环节」别名归并：程序内部（自动异常）会带更细的模块名，
 * 但**展示和筛选一律按上面的环节表**，避免出现「采购 / 采购下单 / 采购在途」三个环节名。
 * 注意：只影响显示与筛选，不改正单上存的值（跳转仍按原值走）。
 */
const EX_ALIAS = { 采购在途: '采购', 采购下单: '采购', 付款: '采购', 收款: '回款', 安装: '安装调试' }
export function exProcess(e) {
  const p = typeof e === 'string' ? e : e?.process
  return EX_ALIAS[p] || p || '其他'
}

/** 采购「未入完」口径：非补件、未取消、还没全部入库（**含部分入库**）。首页 KPI 与采购列表同源 */
export function poOpenInbound(st) {
  return (st.purchaseOrders || []).filter((p) => !p.part && p.closeStatus !== 'closed' && p.inboundStatus !== 'all')
}

/** 异常「类别」枚举：提交异常时下拉选择 */
export const EX_CATEGORY = ['进度延期', '缺料缺货', '质量损坏', '设备故障', '供应商问题', '客户原因', '其他']

export function exOpen(e) {
  return e.closeStatus !== 'closed' && e.doneStatus !== 'done'
}

/** 某个项目 / 采购单 / 环节是否已有未完结异常（首页底部待办据此去重，未完成 ≠ 异常） */
export function hasOpenEx(st, { soId, poId, process } = {}) {
  return (st.exceptions || []).some((e) => {
    if (!exOpen(e)) return false
    if (poId && e.poId === poId) return true
    if (soId && e.soId === soId && (!process || e.process === process)) return true
    return false
  })
}

/** 异常「去处理」的去处：按环节定位，回到对应模块的业务页面。 */
export function handlePath(e) {
  if (e.process === '库存' || e.productId) return '/stock/query'
  if (e.process === '安装调试' || e.process === '安装') return e.soId ? `/install/${e.soId}` : '/install'
  if (e.process === '培训') return e.soId ? `/install/train/${e.soId}` : '/install/train'
  if (e.process === '回款' || e.process === '收款') {
    const b = e.soId ? rcvBillOf(state, e.soId) : null
    return b ? `/sales/receipts/${b.id}` : '/sales/receipts'
  }
  if (e.process === '采购在途' || e.process === '采购下单' || e.process === '付款') {
    if (e.process === '付款' && e.poId) {
      const b = payBillOf(state, e.poId)
      if (b) return `/purchase/payable/${b.id}`
    }
    return e.poId ? `/purchase/po/${e.poId}` : '/purchase/po'
  }
  if (e.process === 'BOM') return e.soId ? `/design/bom/${e.soId}` : '/design/bom'
  if (e.poId) return `/purchase/po/${e.poId}`
  if (e.process === '采购') return '/purchase/po'
  if (e.process === '出库') return e.outId ? `/sales/out/${e.outId}` : '/sales/out'
  if (e.process === '设计') return e.soId ? `/design/${e.soId}` : '/design'
  if (e.process === '生产' && e.soId) {
    const pp = state.productionPlans.find((p) => p.soId === e.soId)
    return pp ? `/production/${pp.id}/edit` : `/sales/${e.soId}`
  }
  if (e.soId) return `/sales/${e.soId}`
  return '/exception'
}

export function nameOf(list, id, key = 'name') {
  return list.find((x) => x.id === id)?.[key] || id || '—'
}

/* 启动时先把「实时提醒」落成异常：保证首页/异常中心每条都能点进详情页。
   放在文件最末，确保 liveReminders / reminderOf 等的依赖都已初始化。 */
syncAutoExceptions(state)

/* 启动时给每个已确认的采购订单补一张付款单、每个未取消的销售订单补一张收款单 */
ensureBills(state)
