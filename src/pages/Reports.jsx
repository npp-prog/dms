import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listBoardItems, listBoards } from '../lib/work.js';
import { listIssues, listProjects } from '../lib/projects.js';
import { localDay } from '../lib/archiveFiles.js';
import { peso } from '../lib/workModel.js';
import {
  AGING_BUCKETS, ageDays, agingBucket, agingSummary, canExportBoard, canExportProject, csvName, overdueDays, projectSummary,
  statusLabels, toCsv, workload,
} from '../lib/reports.js';
import { downloadCsv } from '../lib/download.js';
import Select from '../components/Select.jsx';
import { Assignees, WorkStatus, day } from '../components/WorkBits.jsx';

// How many boards a report reads (each at most 500 items): the report says when there are more.
const MAX_BOARDS = 40;
const TABS = [['aging', 'Aging and overdue'], ['workload', 'Workload'], ['projects', 'Projects']];

// Reports (work management): built from the boards, work items and projects the user can already
// read, so every count respects their access. Exports (CSV) only from the boards and projects that
// let them export.
export default function Reports() {
  const { actor, isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'aging';
  const f = { board: params.get('board') || '', office: params.get('office') === null ? null : params.get('office') === '-' ? '' : params.get('office'), person: params.get('person') || '', bucket: params.get('bucket') || '' };
  const setF = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '' || v === undefined) next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };
  const today = localDay();
  const [boards, setBoards] = useState(null);
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const bs = await listBoards(actor, { all: isAdmin });
        setMore(bs.length > MAX_BOARDS);
        const read = bs.slice(0, MAX_BOARDS);
        setBoards(read);
        const lists = await Promise.all(read.map((b) => listBoardItems(b.id).then((l) => l.map((i) => ({ ...i, boardName: b.name }))).catch(() => [])));
        setItems(lists.flat());
      } catch (e) { setError(e.message); setBoards([]); setItems([]); }
    })();
  }, [actor.uid, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => Object.fromEntries((boards || []).map((b) => [b.id, b])), [boards]);
  const names = useMemo(() => Object.assign({}, ...(boards || []).map((b) => b.names || {})), [boards]);
  const inScope = (items || []).filter((i) => (!f.board || i.boardId === f.board));
  const offices = [...new Set(inScope.map((i) => i.office || ''))].sort();

  return (
    <div className="page wk-reports">
      <div className="page-head"><div><h1>Reports</h1></div></div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setF({ tab: k })}>{label}</button>
        ))}
      </div>
      {error && <div className="alert">{error}</div>}
      {tab !== 'projects' && (
        <div className="filters wk-filters">
          <Select value={f.board} aria-label="Board" onChange={(e) => setF({ board: e.target.value })}>
            <option value="">All my boards</option>
            {(boards || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          {tab === 'aging' && (
            <Select value={f.office ?? '*'} aria-label="Office" onChange={(e) => setF({ office: e.target.value === '*' ? null : e.target.value || '-' })}>
              <option value="*">All offices</option>
              {offices.map((o) => <option key={o || '-'} value={o}>{o || 'No office'}</option>)}
            </Select>
          )}
          {tab === 'aging' && f.person && <span className="chip">{names[f.person] || 'Someone'} <button type="button" title="Show everyone" onClick={() => setF({ person: '' })}>×</button></span>}
        </div>
      )}
      {more && tab !== 'projects' && <p className="xs muted">Showing the first {MAX_BOARDS} boards. Choose a board for the others&rsquo; reports from the board itself.</p>}
      {!items ? <div className="spinner" />
        : tab === 'aging' ? <Aging items={inScope} f={f} setF={setF} byId={byId} names={names} today={today} />
        : tab === 'workload' ? <Workload items={inScope} setF={setF} byId={byId} names={names} today={today} />
        : <Projects today={today} />}
    </div>
  );
}

// Open work items by how overdue they are, and how long they have been open.
function Aging({ items, f, setF, byId, names, today }) {
  const { actor, isAdmin } = useAuth();
  const scoped = items.filter((i) => (f.office === null || (i.office || '') === f.office) && (!f.person || (i.assignees || []).includes(f.person)));
  const summary = agingSummary(scoped, today);
  const rows = scoped.filter((i) => i.status !== 'done' && (!f.bucket || agingBucket(i, today) === f.bucket))
    .sort((a, b) => overdueDays(b, today) - overdueDays(a, today) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const exportable = rows.filter((i) => canExportBoard(byId[i.boardId], actor.uid, isAdmin));
  const exportCsv = () => downloadCsv(csvName('work-aging', today), toCsv([
    { label: 'Board', get: (i) => i.boardName },
    { label: 'Work item', get: (i) => i.title },
    { label: 'Status', get: (i) => statusLabels[i.status] || i.status },
    { label: 'Assigned to', get: (i) => (i.assignees || []).map((u) => names[u] || i.assigneeNames?.[u] || 'Someone').join('; ') },
    { label: 'Responsible office', get: (i) => i.office || '' },
    { label: 'Due date', get: (i) => i.dueDate || '' },
    { label: 'Days overdue', get: (i) => overdueDays(i, today) || '' },
    { label: 'Days open', get: (i) => ageDays(i, today) ?? '' },
    { label: 'Aging', get: (i) => AGING_BUCKETS.find((b) => b.id === agingBucket(i, today)).label },
    { label: 'Linked documents', get: (i) => (i.docRefs || []).length },
  ], exportable));
  return (
    <>
      <div className="wk-tiles">
        {AGING_BUCKETS.map((b) => (
          <button key={b.id} type="button" className={`wk-tile wk-tile-${b.tone}${f.bucket === b.id ? ' active' : ''}`} aria-pressed={f.bucket === b.id}
            onClick={() => setF({ bucket: f.bucket === b.id ? '' : b.id })}>
            <span className="n">{summary[b.id]}</span><span className="l">{b.label}</span>
          </button>
        ))}
      </div>
      <div className="row gap wrap wk-report-bar">
        <span className="small muted grow">{rows.length} open work item{rows.length === 1 ? '' : 's'}{f.bucket ? `: ${AGING_BUCKETS.find((b) => b.id === f.bucket).label.toLowerCase()}` : ''}</span>
        <ExportButton total={rows.length} allowed={exportable.length} onExport={exportCsv} />
      </div>
      <div className="table-card wk-table-wrap">
        <table className="data-table wk-table">
          <thead><tr><th>Work item</th><th>Board</th><th>Status</th><th>Assigned</th><th>Office</th><th>Due</th><th className="num">Overdue</th><th className="num">Open</th></tr></thead>
          <tbody>
            {rows.slice(0, 300).map((i) => (
              <tr key={i.id}>
                <td className="wk-title"><Link to={`/boards/${i.boardId}/${i.id}`}><b>{i.title}</b></Link></td>
                <td className="small">{i.boardName}</td>
                <td><WorkStatus id={i.status} /></td>
                <td><Assignees item={i} names={byId[i.boardId]?.names || {}} /></td>
                <td className="small">{i.office || '—'}</td>
                <td className="small">{i.dueDate ? day(i.dueDate) : '—'}</td>
                <td className={`small num${overdueDays(i, today) ? ' wk-due-overdue' : ''}`}>{overdueDays(i, today) ? `${overdueDays(i, today)} d` : '—'}</td>
                <td className="small num">{ageDays(i, today) ?? '—'}{ageDays(i, today) !== null ? ' d' : ''}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="small muted">No open work items here.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > 300 && <p className="xs muted">Showing 300 of {rows.length}; the export has them all.</p>}
    </>
  );
}

// Open, overdue, blocked and upcoming work per office or person.
function Workload({ items, setF, byId, names, today }) {
  const { actor, isAdmin } = useAuth();
  const [by, setBy] = useState('office');
  const rows = workload(items, today, by);
  const label = (k) => (by === 'office' ? k || 'No office' : k ? names[k] || 'Someone' : 'Not assigned');
  const exportable = items.filter((i) => canExportBoard(byId[i.boardId], actor.uid, isAdmin));
  const exportCsv = () => downloadCsv(csvName(`work-load-by-${by}`, today), toCsv([
    { label: by === 'office' ? 'Responsible office' : 'Person', get: (r) => label(r.key) },
    { label: 'Open', get: (r) => r.open }, { label: 'Overdue', get: (r) => r.overdue }, { label: 'Blocked', get: (r) => r.blocked },
    { label: 'Due in 7 days', get: (r) => r.soon }, { label: 'Completed, last 30 days', get: (r) => r.doneRecent },
  ], workload(exportable, today, by)));
  const open = (r, extra = {}) => setF({ tab: 'aging', ...(by === 'office' ? { office: r.key || '-', person: '' } : { person: r.key, office: null }), bucket: '', ...extra });
  return (
    <>
      <div className="row gap wrap wk-report-bar">
        <span className="wk-view-switch" role="group" aria-label="Group by">
          <button type="button" className={by === 'office' ? 'active' : ''} aria-pressed={by === 'office'} onClick={() => setBy('office')}>By office</button>
          <button type="button" className={by === 'person' ? 'active' : ''} aria-pressed={by === 'person'} onClick={() => setBy('person')}>By person</button>
        </span>
        <span className="grow" />
        <ExportButton total={items.length} allowed={exportable.length} onExport={exportCsv} />
      </div>
      <div className="table-card wk-table-wrap">
        <table className="data-table wk-table">
          <thead><tr><th>{by === 'office' ? 'Responsible office' : 'Person'}</th><th className="num">Open</th><th className="num">Overdue</th><th className="num">Blocked</th><th className="num">Due in 7 days</th><th className="num">Completed, 30 days</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key || '-'}>
                <td><button type="button" className="link" onClick={() => open(r)}>{label(r.key)}</button></td>
                <td className="num">{r.open}</td>
                <td className="num">{r.overdue ? <button type="button" className="link wk-due-overdue" onClick={() => open(r)}>{r.overdue}</button> : 0}</td>
                <td className="num">{r.blocked}</td><td className="num">{r.soon}</td><td className="num">{r.doneRecent}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="small muted">No work items yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {by === 'person' && <p className="xs muted">An item assigned to several people counts for each of them.</p>}
    </>
  );
}

// Each project in a row: status, physical progress, milestones, open issues, budget, time left.
function Projects({ today }) {
  const { actor, isAdmin } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const ps = (await listProjects(actor, { all: isAdmin })).slice(0, 100);
        const issues = await Promise.all(ps.map((p) => listIssues(p.id).then((l) => l.filter((x) => x.status === 'open').length).catch(() => null)));
        setRows(ps.map((p, i) => ({ ...projectSummary(p, issues[i], today), project: p })));
      } catch (e) { setError(e.message); setRows([]); }
    })();
  }, [actor.uid, isAdmin, today]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <div className="alert">{error}</div>;
  if (!rows) return <div className="spinner" />;
  const exportable = rows.filter((r) => canExportProject(r.project, actor.uid, isAdmin));
  const exportCsv = () => downloadCsv(csvName('projects', today), toCsv([
    { label: 'Project code', get: (r) => r.code }, { label: 'Project', get: (r) => r.name }, { label: 'Implementing office', get: (r) => r.office },
    { label: 'Status', get: (r) => r.status }, { label: 'Physical progress (%)', get: (r) => r.physical },
    { label: 'Milestones done', get: (r) => r.milestonesDone }, { label: 'Milestones', get: (r) => r.milestonesTotal },
    { label: 'Overdue milestones', get: (r) => r.overdueMilestones }, { label: 'Open risks and issues', get: (r) => r.openIssues ?? '' },
    { label: 'Funding source', get: (r) => r.fundingSource }, { label: 'Approved budget', get: (r) => r.approvedBudget ?? '' },
    { label: 'Target completion', get: (r) => r.targetDate }, { label: 'Days left', get: (r) => r.daysLeft ?? '' },
  ], exportable));
  return (
    <>
      <div className="row gap wrap wk-report-bar">
        <span className="small muted grow">{rows.length} project{rows.length === 1 ? '' : 's'}</span>
        <ExportButton total={rows.length} allowed={exportable.length} onExport={exportCsv} what="projects" />
      </div>
      <div className="table-card wk-table-wrap">
        <table className="data-table wk-table">
          <thead><tr><th>Project</th><th>Office</th><th>Status</th><th>Physical</th><th className="num">Milestones</th><th className="num">Open issues</th><th className="num">Approved budget</th><th>Target</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="wk-title"><Link to={`/projects/${r.id}`}><b>{r.code}</b> {r.name}</Link></td>
                <td className="small">{r.office || '—'}</td>
                <td className="small">{r.status}</td>
                <td><span className="wk-bar" title={`${r.physical}%`}><span style={{ width: `${r.physical}%` }} /></span> <span className="xs">{r.physical}%</span></td>
                <td className="small num">{r.milestonesDone}/{r.milestonesTotal}{r.overdueMilestones > 0 && <span className="xs wk-due-overdue"> · {r.overdueMilestones} overdue</span>}</td>
                <td className="small num">{r.openIssues ?? '—'}</td>
                <td className="small num">{peso(r.approvedBudget)}</td>
                <td className="small">{r.targetDate ? day(r.targetDate) : '—'}{r.daysLeft !== null && <span className={`xs${r.daysLeft < 0 ? ' wk-due-overdue' : ' muted'}`}> · {r.daysLeft < 0 ? `${-r.daysLeft} d late` : `${r.daysLeft} d left`}</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="small muted">No projects yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="xs muted">Physical progress is as last reported on each project. Only approved budgets are shown: obligations and disbursements are not computed from documents.</p>
    </>
  );
}

// Export: says how many rows the user may export (boards or projects that do not allow it are left out).
function ExportButton({ total, allowed, onExport, what = 'work items' }) {
  if (!allowed) return total ? <span className="xs muted">Export: not allowed for these {what}.</span> : null;
  return (
    <span className="row gap">
      {allowed < total && <span className="xs muted">{total - allowed} left out of the export (not allowed)</span>}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onExport}>Export CSV</button>
    </span>
  );
}
