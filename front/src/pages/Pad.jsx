import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { nameOf, prodRiskTone, useStore } from '../store'
import { useDialog } from '../ui'
import { useExReport } from '../exReport'

function ymd(s) {
  return String(s || '').slice(0, 10)
}

/** 延期横幅：灯色与电脑端共用 store 的 prodRiskTone（步骤计划日 + 目标进度为准）。 */
function delayBanner(pp, state) {
  const tone = prodRiskTone(state, pp)
  if (!tone) return null
  const overall = Number(pp.progress) || 0
  let pick = null
  for (const name of stepNamesOf(pp)) {
    const st = pp.steps.find((s) => s.name === name)
    if (!st?.date) continue
    if ((st.progress || 0) >= 100) continue
    if (overall >= Number(st.target || 0)) continue
    if (!pick || ymd(st.date) < ymd(pick.date)) pick = { ...st, name }
  }
  if (!pick) return null
  return tone === 'overdue'
    ? { kind: 'over', text: `延期 · ${pick.name}计划 ${ymd(pick.date)} 应到 ${pick.target}%，整单现在 ${overall}%` }
    : { kind: 'soon', text: `即将延期 · ${pick.name}计划 ${ymd(pick.date)} 应到 ${pick.target}%，整单现在 ${overall}%` }
}

function stepNamesOf(pp) {
  return pp?.robot === false ? ['结构', '电路', '装配'] : ['结构', '电路', '机器人', '装配']
}

function firstOpenStep(pp) {
  const names = stepNamesOf(pp)
  const working = [...names].reverse().find((n) => {
    const p = pp.steps.find((s) => s.name === n)?.progress || 0
    return p > 0 && p < 100
  })
  if (working) return working
  return names.find((n) => (pp.steps.find((s) => s.name === n)?.progress || 0) < 100) || names[0]
}

export default function Pad() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const ex = useExReport()
  const [whoId, setWhoId] = useState('')
  const [taskId, setTaskId] = useState('')

  useEffect(() => {
    document.title = '厂内平板 · 三喜'
    return () => { document.title = '三喜机器人产销存' }
  }, [])

  const padUsers = state.employees.filter((e) => e.pad && e.status !== 'off')
  const who = padUsers.find((e) => e.id === whoId)
  const tasks = state.productionPlans.filter((p) => !p.done && p.confirmStatus === 'confirmed')
  const pp = state.productionPlans.find((p) => p.id === taskId && !p.done && p.confirmStatus === 'confirmed')

  return (
    <div className="pad-app">
      {node}
      {ex.node}
      <div className="pad-frame">
        {!who && (
          <WhoScreen
            padUsers={padUsers}
            onPick={setWhoId}
            onOffice={() => nav('/')}
          />
        )}
        {who && !pp && (
          <TaskList
            who={who}
            state={state}
            tasks={tasks}
            onPick={setTaskId}
            onSwitch={() => { setWhoId(''); setTaskId('') }}
            onOffice={() => nav('/')}
          />
        )}
        {who && pp && (
          <TaskDetail
            who={who}
            state={state}
            actions={actions}
            pp={pp}
            ask={ask}
            flash={flash}
            onBack={() => setTaskId('')}
            onSwitch={() => { setWhoId(''); setTaskId('') }}
          />
        )}
      </div>
    </div>
  )
}

function WhoScreen({ padUsers, onPick, onOffice }) {
  return (
    <>
      <header className="pad-head">
        <div className="pad-mark">厂内平板</div>
        <h1>今天谁用这块板</h1>
        <p>车间共用。点自己的名字开始打卡。办公室在电脑上授权谁能出现在这里。</p>
      </header>
      <div className="pad-body">
        {padUsers.length === 0 && <p className="pad-empty">还没有人被授权平板打卡。请办公室在员工账号里打开授权。</p>}
        <div className="pad-who-grid">
          {padUsers.map((e) => (
            <button key={e.id} className="pad-who" onClick={() => onPick(e.id)}>
              <span className="pad-who-av">{e.name.slice(0, 1)}</span>
              <b>{e.name}</b>
              <span>{e.role || '生产'}</span>
            </button>
          ))}
        </div>
      </div>
      <button className="pad-office" onClick={onOffice}>办公室电脑端</button>
    </>
  )
}

function TaskList({ who, state, tasks, onPick, onSwitch, onOffice }) {
  return (
    <>
      <header className="pad-head">
        <div className="pad-head-row">
          <div className="pad-mark">我的任务</div>
          <button className="pad-link" onClick={onSwitch}>{who.name} · 换人</button>
        </div>
        <h1>今天做哪一台</h1>
        <p>只列还没确认完成的生产。点进去拍照打卡。确认完成在办公室电脑上点。</p>
      </header>
      <div className="pad-body">
        {tasks.length === 0 && <p className="pad-empty">暂时没有进行中的生产任务。</p>}
        {tasks.map((p) => {
          const so = state.salesOrders.find((s) => s.id === p.soId)
          const delay = delayBanner(p, state)
          const today = ymd(new Date().toISOString())
          const punched = state.punches.some((x) => x.soId === p.soId && ymd(x.at) === today)
          return (
            <button key={p.id} className="pad-task" onClick={() => onPick(p.id)}>
              <div className="pad-task-top">
                <b>{so?.projectName || p.soId}</b>
                <span>{punched ? '今日已打' : '今日未打'}</span>
              </div>
              <p>{nameOf(state.customers, so?.customerId)} · {p.soId}</p>
              <div className="pad-bar"><i style={{ width: `${p.progress || 0}%` }} /></div>
              <div className="pad-task-foot">
                <em>整单 {p.progress || 0}%</em>
                {delay ? <strong className={delay.kind === 'over' ? 'bad' : 'warn'}>{delay.kind === 'over' ? '延期' : '即将延期'}</strong> : <span>按点进行</span>}
              </div>
            </button>
          )
        })}
      </div>
      <button className="pad-office" onClick={onOffice}>办公室电脑端</button>
    </>
  )
}

function TaskDetail({ who, state, actions, pp, ask, flash, onBack, onSwitch }) {
  const so = state.salesOrders.find((s) => s.id === pp.soId)
  const names = stepNamesOf(pp)
  const [step, setStep] = useState(() => firstOpenStep(pp))
  const [progress, setProgress] = useState(String(pp.progress || 0))
  const [note, setNote] = useState('')
  const [roll, setRoll] = useState('')
  const [photo, setPhoto] = useState('')
  const [skipPhoto, setSkipPhoto] = useState(false)
  const wire = state.products.find((p) => p.id === 'M004')
  const delay = delayBanner(pp, state)
  const today = ymd(new Date().toISOString())
  const todayPunches = state.punches.filter((x) => x.soId === pp.soId && ymd(x.at) === today)

  function submit() {
    if (!photo && !skipPhoto) {
      flash({ ok: false, message: '请先拍照，或点「现场没法拍」' })
      return
    }
    if (roll === '') {
      flash({ ok: false, message: '卷材每天必打，没用请填 0' })
      return
    }
    if (String(progress).trim() === '' || Number(progress) <= 0) {
      flash({ ok: false, message: '整单进度不能填 0，也不能留空。可以比上次小（填错了就改回来），但要有进度。' })
      return
    }
    ask('提交打卡', '确认提交今日打卡。卷材有用量会立刻原料出库。', () => {
      const r = actions.punch(pp.soId, progress, roll, {
        step,
        note,
        by: who.name,
        photo,
        overall: true,
        rollRaw: roll,
      })
      if (r.ok) {
        setNote('')
        setRoll('')
        setPhoto('')
        setSkipPhoto(false)
      }
      return r
    })
  }

  return (
    <>
      <header className="pad-head">
        <div className="pad-head-row">
          <button className="pad-link" onClick={onBack}>← 任务</button>
          <button className="pad-link" onClick={onSwitch}>{who.name} · 换人</button>
        </div>
        <h1>{so?.projectName || pp.soId}</h1>
        <p>{nameOf(state.customers, so?.customerId)} · 打卡挂你今天所在工位。确认完成只有办公室能点。</p>
      </header>
      <div className="pad-body">
        {delay && <div className={`pad-delay ${delay.kind}`}>{delay.text}<span>系统提示，不用报延期</span></div>}

        <div className="pad-card">
          <div className="pad-card-h">
            <b>整单进度</b>
            <em>{pp.progress || 0}%</em>
          </div>
          <div className="pad-bar lg"><i style={{ width: `${pp.progress || 0}%` }} /></div>
          <p className="pad-note">到某步计划日时，用这条总进度对照该步目标，办公室判黄/红。</p>
        </div>

        <div className="pad-card">
          <b>我在哪个工位</b>
          <div className="pad-stations">
            {names.map((name) => {
              const st = pp.steps.find((s) => s.name === name)
              return (
                <button key={name} className={`pad-st ${step === name ? 'on' : ''}`} onClick={() => setStep(name)}>
                  {name}
                  <span>{st?.progress || 0}%</span>
                </button>
              )
            })}
          </div>
        </div>

        <label className="pad-shot">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0]
              setPhoto(f?.name || '')
              setSkipPhoto(false)
            }}
          />
          <span className="pad-shot-ico">＋</span>
          <b>{photo ? `已拍 · ${photo}` : '拍一张现场'}</b>
          <span>{photo ? '再点可换一张' : '每天打卡要拍照'}</span>
        </label>
        {!photo && (
          <button className="pad-textbtn" onClick={() => setSkipPhoto(true)}>
            {skipPhoto ? '已记下：现场没法拍，先记一笔' : '现场没法拍，先记一笔'}
          </button>
        )}

        <label className="pad-lab">今日做了什么</label>
        <textarea className="pad-area" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="组对、接线、打磨…" />

        <label className="pad-lab">整单做到 %</label>
        <input className="pad-num" inputMode="numeric" value={progress} onChange={(e) => setProgress(e.target.value)} />

        <label className="pad-lab">卷材用量（%，整卷 100，没用填 0。线材可用 {wire?.stock ?? 0}）</label>
        <input className="pad-num" inputMode="decimal" value={roll} onChange={(e) => setRoll(e.target.value)} placeholder="必填，没用填 0" />

        <button className="pad-submit" onClick={submit}>提交打卡</button>
        {todayPunches.length > 0 && (
          <p className="pad-note">今天已打 {todayPunches.length} 次，还可再打。最近：{todayPunches[0].by} {todayPunches[0].step} {todayPunches[0].progress}%</p>
        )}

        <div className="pad-card">
          <b>报异常</b>
          <p className="pad-note">延期只看上面系统提示。人工只报缺料、设备故障、其他。</p>
          <div className="pad-ex">
            <button onClick={() => ex.open({ process: '生产', soId: pp.soId, category: '缺料缺货', title: '缺料', createdBy: who.name, hint: '缺什么料？办公室会在异常中心看到。', onDone: flash })}>缺料</button>
            <button onClick={() => ex.open({ process: '生产', soId: pp.soId, category: '设备故障', title: '设备故障', createdBy: who.name, hint: '哪台设备、什么情况。', onDone: flash })}>设备故障</button>
            <button onClick={() => ex.open({ process: '生产', soId: pp.soId, category: '其他', title: '其他', createdBy: who.name, hint: '请说明。', onDone: flash })}>其他</button>
          </div>
        </div>
      </div>
    </>
  )
}
