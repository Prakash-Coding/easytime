import {spendReport} from './spend-domain.mjs';
import {xlsx} from './payroll-xlsx.mjs';

const cents=value=>Number.isSafeInteger(value)?value:0;
const amount=value=>cents(value)/100;
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(amount(value));
const lookup=(db,kind,id)=>db[kind]?.find(item=>item.id===id)?.name||id||'';
function context(db,filters){const report=spendReport(db,filters),f={...filters,...report.filters};return {db,report,f,store:id=>lookup(db,'stores',id),employee:id=>lookup(db,'employees',id),place:f.store?lookup(db,'stores',f.store):'All authorized stores'};}
const scopeNotes=[
 'Actual spending includes Approved expenses only. Pending commitments include Submitted expenses only. Draft, Returned and Voided records are not actual or pending spending.',
 'Overall actual and pending totals count each matching expense once, including expenses without a matching budget.',
 'Budget limits are full original-period amounts for budgets intersecting the selected dates; limits are not prorated. Selected-date actual/pending amounts can cover only part of a budget period.',
 'Remaining budget, remaining after pending, utilization and budget status use all authorized matching expenses in each complete original budget period. Date, employee and expense-status view filters do not change this period context.',
 'An expense-status or employee filter limits selected-date expense rows and spending totals. Compare those filtered amounts with care: the full budget limit and complete-period remaining are unchanged.',
 'Manual expense reporting; no card or supplier payments.'
];

export function spendReportRows(db,filters={}){
 const {report:r,f,store,employee,place}=context(db,filters),t=r.totals||{};
 const rows=[['EasyTime - Budgets and spending report'],['From',f.from||'','Through',f.to||''],['Store',place],['Employee',f.employee?employee(f.employee):'All authorized employees'],['Category',f.category||'All categories'],['Expense status',f.status||'All statuses'],['Currency','USD'],...scopeNotes.map(note=>['Notes',note]),[],['Selected-date summary'],['Full-period budget limits',amount(t.budgetCents)],['Approved actual spending',amount(t.approvedCents)],['Submitted pending commitments',amount(t.pendingCents)],['Approved spending without a budget',amount(t.unbudgetedCents)],['Remaining across complete budget periods',amount(t.remainingCents)],[],['Budgets - full limits and remaining; actual and pending within selected report dates'],['Budget','Store','Category','Assigned employee','Budget from','Budget through','Full-period limit USD','Approved actual USD','Submitted pending USD','Complete-period remaining USD','Complete-period remaining after pending USD','Utilization %','Status','Coverage','Alert threshold %']];
 for(const b of r.budgets||[])rows.push([b.name,store(b.store),b.category,b.employee?employee(b.employee):'Store team',b.from,b.to,amount(b.limitCents),amount(b.approvedCents),amount(b.pendingCents),amount(b.remainingCents),amount(b.committedRemainingCents),b.utilization===null||b.utilization===undefined?'N/A':Number(b.utilization),b.status,b.coverage,b.alertPercent]);
 if((r.budgets||[]).some(b=>Number.isSafeInteger(b.periodApprovedCents)||Number.isSafeInteger(b.periodPendingCents))){rows.push([],['Complete budget-period context - independent of selected-date actual totals'],['Budget','Store','Period from','Period through','Full-period limit USD','Complete-period approved USD','Complete-period submitted USD']);for(const b of r.budgets||[])rows.push([b.name,store(b.store),b.from,b.to,amount(b.limitCents),Number.isSafeInteger(b.periodApprovedCents)?amount(b.periodApprovedCents):'Not provided',Number.isSafeInteger(b.periodPendingCents)?amount(b.periodPendingCents):'Not provided']);}
 rows.push([],['Category breakdown'],['Category','Approved actual USD','Submitted pending USD'],...(r.byCategory||[]).map(row=>[row.category,amount(row.approvedCents),amount(row.pendingCents)]),[],['Store breakdown'],['Store','Approved actual USD','Submitted pending USD'],...(r.byStore||[]).map(row=>[store(row.store),amount(row.approvedCents),amount(row.pendingCents)]),[],['Monthly breakdown'],['Month','Approved actual USD','Submitted pending USD'],...(r.monthly||[]).map(row=>[row.month,amount(row.approvedCents),amount(row.pendingCents)]),[],['Expense detail - selected filters'],['Date','Store','Employee','Category','Vendor','Amount USD','Status','Note','Expense ID']);
 for(const e of r.expenses||[])rows.push([e.date,store(e.store),employee(e.employee),e.category,e.vendor||'',amount(e.amountCents),e.status,e.note||'',e.id]);
 return rows;
}

// CSV cells remain literal even when a user-supplied vendor, category or note
// starts with spreadsheet formula characters (including leading whitespace).
function csvCell(value){let text;if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Report contains an invalid number.');text=String(value);}else{text=String(value??'');if(/^\s*[=+@-]/u.test(text)||/^[\t\r\n]/.test(text))text="'"+text;}return '"'+text.replaceAll('"','""')+'"';}
export function spendCsv(db,filters={}){return '\uFEFF'+spendReportRows(db,filters).map(row=>row.map(csvCell).join(',')).join('\r\n');}

// Paginated vector PDF with repeated column headers and split long rows.
// All monetary figures come from the same integer-cent report as the dashboard.
export function spendPdfReport(db,filters={}){
 const {report:r,f,store,employee,place}=context(db,filters),t=r.totals||{},pages=[];
 const ascii=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[·–—]/g,'-').replace(/[^\x20-\x7e]/g,'?'),escape=value=>ascii(value).replace(/[\\()]/g,'\\$&');
 let commands=[],y=0,page=0;
 const draw=(text,x,baseline,size=9,color='0.18 0.20 0.28')=>commands.push(`BT /F1 ${size} Tf ${color} rg 1 0 0 1 ${x} ${baseline} Tm (${escape(text)}) Tj ET`);
 const rule=baseline=>commands.push(`0.88 0.88 0.94 RG 35 ${baseline} m 807 ${baseline} l S`);
 const widthOf=(text,size)=>[...text].reduce((width,char)=>width+size*(char===' '?0.3:/[MWmw@%]/.test(char)?1.05:/[ilI.,;:'|!]/.test(char)?0.32:/[A-Z]/.test(char)?0.8:/[0-9]/.test(char)?0.6:0.65),0);
 const wrap=(value,width,size=8)=>{const words=ascii(value).split(/\s+/),pieces=[];for(const word of words){if(widthOf(word,size)<=width){pieces.push(word);continue;}let chunk='';for(const char of word){if(chunk&&widthOf(chunk+char,size)>width){pieces.push(chunk);chunk='';}chunk+=char;}if(chunk)pieces.push(chunk);}const lines=[];let line='';for(const word of pieces){const candidate=(line+' '+word).trim();if(line&&widthOf(candidate,size)>width){lines.push(line);line=word;}else line=candidate;}if(line)lines.push(line);return lines.length?lines:[''];};
 function newPage(){if(commands.length)pages.push(commands.join('\n'));commands=[];page++;commands.push('0.985 0.985 1 rg 0 0 842 595 re f');draw('EasyTime',35,554,23,'0.4 0.34 0.85');draw('BUDGETS & SPENDING',620,556,11,'0.4 0.34 0.85');let headY=531;for(const line of wrap(`${f.from||''} through ${f.to||''} | ${place}`,772,9)){draw(line,35,headY,9);headY-=13;}for(const line of wrap(`Employee: ${f.employee?employee(f.employee):'All authorized employees'} | Category: ${f.category||'All'} | Status: ${f.status||'All'} | Currency: USD`,772,8)){draw(line,35,headY,8);headY-=12;}rule(headY-3);draw(`Manual expense reporting; no card or supplier payments. | Page ${page}`,35,22,8,'0.45 0.45 0.55');y=headY-23;}
 function ensure(height){if(y-height<45)newPage();}
 function paragraph(text,size=8){const lines=wrap(text,772,size);for(const line of lines){ensure(size+7);draw(line,35,y,size,'0.42 0.43 0.52');y-=size+5;}y-=5;}
 function section(title){ensure(title==='Budget comparison'?190:110);draw(title,35,y,12,'0.35 0.3 0.65');y-=22;}
 function table(headers,records,widths){
  function header(){const cells=headers.map((text,i)=>wrap(text,widths[i]-12,8)),lines=Math.max(...cells.map(cell=>cell.length)),height=lines*11+12;ensure(height+30);commands.push(`0.93 0.92 0.98 rg 35 ${y-height+12} 772 ${height} re f`);let x=35;cells.forEach((cell,i)=>{cell.forEach((line,j)=>draw(line,x+6,y-j*11,8));x+=widths[i];});y-=height+4;}
  header();
  if(!records.length){ensure(25);draw('No matching records.',41,y,8);y-=25;return;}
  for(const record of records){const lines=record.map((value,i)=>wrap(value,widths[i]-12,8)),lineCount=Math.max(...lines.map(cell=>cell.length));let consumed=0;
   while(consumed<lineCount){if(y-24<45){newPage();header();}const capacity=Math.max(1,Math.floor((y-55)/11)),take=Math.min(lineCount-consumed,capacity),height=take*11+10;let x=35;
    lines.forEach((cell,i)=>{for(let n=0;n<take;n++){const text=cell[consumed+n];if(text!==undefined)draw(text,x+6,y-n*11,8);}x+=widths[i];});y-=height;rule(y+4);consumed+=take;if(consumed<lineCount){newPage();header();}}
  }y-=14;
 }
 newPage();section('Selected-date spending summary');table(['Measure','Amount USD'],[['Full original-period budget limits',money(t.budgetCents)],['Approved actual spending',money(t.approvedCents)],['Submitted pending commitments',money(t.pendingCents)],['Approved spending without a budget',money(t.unbudgetedCents)],['Remaining across complete budget periods',money(t.remainingCents)]],[560,212]);
 for(const note of scopeNotes)paragraph(note);
 section('Budget comparison');paragraph('Limits below cover each budget\'s entire original period and are not prorated. Actual and pending amounts use selected view filters. Remaining, utilization and status use all authorized expenses in each full budget period, unaffected by employee/status view filters.');
 table(['Budget / store / category','Budget period / coverage','Full limit','Approved','Pending','Period remaining / after pending','Status'],(r.budgets||[]).map(b=>[`${b.name} / ${store(b.store)} / ${b.category}${b.employee?' / '+employee(b.employee):' / Store team'}`,`${b.from} to ${b.to} / ${b.coverage}`,money(b.limitCents),money(b.approvedCents),money(b.pendingCents),money(b.remainingCents)+' / '+money(b.committedRemainingCents),`${b.status} / ${b.utilization===null||b.utilization===undefined?'N/A':Number(b.utilization).toFixed(1)+'%'} used`]),[200,145,75,75,75,115,87]);
 if((r.budgets||[]).some(b=>Number.isSafeInteger(b.periodApprovedCents)||Number.isSafeInteger(b.periodPendingCents))){section('Complete budget-period context');table(['Budget / store','Period','Full limit','Period approved','Period pending'],(r.budgets||[]).map(b=>[`${b.name} / ${store(b.store)}`,`${b.from} to ${b.to}`,money(b.limitCents),Number.isSafeInteger(b.periodApprovedCents)?money(b.periodApprovedCents):'Not provided',Number.isSafeInteger(b.periodPendingCents)?money(b.periodPendingCents):'Not provided']),[252,175,115,115,115]);}
 section('Category breakdown');table(['Category','Approved actual','Submitted pending'],(r.byCategory||[]).map(row=>[row.category,money(row.approvedCents),money(row.pendingCents)]),[442,165,165]);
 section('Store breakdown');table(['Store','Approved actual','Submitted pending'],(r.byStore||[]).map(row=>[store(row.store),money(row.approvedCents),money(row.pendingCents)]),[442,165,165]);
 section('Monthly breakdown');table(['Month','Approved actual','Submitted pending'],(r.monthly||[]).map(row=>[row.month,money(row.approvedCents),money(row.pendingCents)]),[442,165,165]);
 section('Expense detail');table(['Date / store','Employee / category','Vendor','Amount USD','Status','Note / reference'],(r.expenses||[]).map(e=>[`${e.date} / ${store(e.store)}`,`${employee(e.employee)} / ${e.category}`,e.vendor||'',money(e.amountCents),e.status,e.note||'']),[125,160,120,85,85,197]);
 pages.push(commands.join('\n'));
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'],kids=[];
 for(const content of pages){const p=objects.length+1,c=p+1;kids.push(`${p} 0 R`);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${c} 0 R >>`,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);}
 objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;let output='%PDF-1.4\n',offsets=[0];objects.forEach((object,i)=>{offsets.push(output.length);output+=`${i+1} 0 obj\n${object}\nendobj\n`;});const xref=output.length;
 output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new Blob([output],{type:'application/pdf'});
}

export async function downloadSpendReport(format,db,filters={}){
 if(!['csv','xlsx','pdf'].includes(format))throw Error('Choose CSV, Excel or PDF.');
 const blob=format==='csv'?new Blob([spendCsv(db,filters)],{type:'text/csv;charset=utf-8'}):format==='pdf'?spendPdfReport(db,filters):xlsx(spendReportRows(db,filters),'Budgets');
 const url=URL.createObjectURL(blob),anchor=document.createElement('a'),report=spendReport(db,filters),f={...filters,...report.filters};anchor.href=url;anchor.download=`EasyTime-budgets-${f.from||'all'}-${f.to||'dates'}.${format}`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);return blob;
}
