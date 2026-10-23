import { getStore } from '@netlify/blobs';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);

const store = getStore({ name: 'forge-report-system', consistency: 'strong' });
const headers = { 'Content-Type':'application/json; charset=utf-8', 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type, Authorization', 'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS' };
const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const fail = (statusCode, message) => json(statusCode, { message });
const departments = [
  {id:1,name:'Academics',site:'Bloemfontein'}, {id:2,name:'Academics',site:'Clearwater'},
  {id:3,name:'Construct',site:'Clearwater'}, {id:4,name:'Consult',site:'Clearwater'},
  {id:5,name:'EXCO',site:'Clearwater'}, {id:6,name:'Finance',site:'Clearwater'},
  {id:7,name:'FNC',site:'Northern Campus'}, {id:8,name:'HR & Payroll',site:'Clearwater'},
  {id:9,name:'IT/Ozone',site:'Clearwater'}, {id:10,name:'Studios',site:'Clearwater'},
  {id:11,name:'Talent',site:'Clearwater'}, {id:12,name:'Compliance',site:'Underberg'}
];
const emailKey = email => createHash('sha256').update(email.toLowerCase()).digest('hex');
const userKey = id => `users/id-${id}`;
const reportKey = id => `reports/${String(id).padStart(12,'0')}`;
const attachmentKey = (id) => `attachments/${id}`;
const getPath = event => (event.path || '/').replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '').replace(/\/$/, '') || '/';
function body(event) { if (!event.body) return {}; try { return JSON.parse(event.body); } catch { return {}; } }
async function read(key) { return await store.get(key, { type:'json' }); }
async function write(key, value) { await store.setJSON(key, value); }
async function allWithPrefix(prefix) {
  const found=[];
  const result = await store.list({ prefix });
  for (const item of (result.blobs || [])) { const value=await read(item.key); if(value) found.push(value); }
  return found;
}
async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64);
  return { salt, hash: Buffer.from(derived).toString('hex') };
}
async function passwordMatches(password, record) {
  const result=await scrypt(password, record.salt, 64);
  const a=Buffer.from(result), b=Buffer.from(record.hash, 'hex');
  return a.length===b.length && timingSafeEqual(a,b);
}
function publicUser(user) {
  const dept=departments.find(d=>d.id===Number(user.departmentId));
  return {id:user.id,name:user.name,email:user.email,role:user.role,departmentId:user.departmentId,department:dept?.name || '',site:dept?.site || ''};
}
async function currentUser(event) {
  const auth=event.headers?.authorization || event.headers?.Authorization || '';
  const token=auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token) return {error:fail(401,'Please log in again.')};
  const session=await read(`sessions/${token}`);
  if(!session || session.expiresAt < Date.now()) return {error:fail(401,'Your session has expired. Please log in again.')};
  const user=await read(userKey(session.userId));
  if(!user) return {error:fail(401,'Your account could not be found. Please log in again.')};
  return {user};
}
function mapReport(r, user, attachmentUrl=null) {
  const dept=departments.find(d=>d.id===Number(r.departmentId));
  return {id:r.id,projectTitle:r.projectTitle,department:dept?.name || '',site:dept?.site || '',submittedBy:user?.name || '',departmentId:r.departmentId,submittedById:r.submittedById,projectStatus:r.projectStatus,projectSummary:r.projectSummary,challenges:r.challenges,nextSteps:r.nextSteps,importance:r.importance,dueDate:r.dueDate,reportingDate:r.reportingDate,reviewStatus:r.reviewStatus,adminFeedback:r.adminFeedback || '',attachmentFileName:r.attachmentFileName || null,attachmentFilePath:r.attachmentFilePath || null,attachmentUrl};
}
async function expandedReport(r) {
  const user=await read(userKey(r.submittedById));
  const attachmentUrl=r.attachmentFilePath ? `/api/reports/${r.id}/attachment/download` : null;
  return mapReport(r,user,attachmentUrl);
}
export async function handler(event) {
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers,body:''};
  const path=getPath(event), method=event.httpMethod, input=body(event);
  try {
    if(method==='GET' && path.toLowerCase()==='/auth/departments') return json(200,departments);
    if(method==='POST' && path.toLowerCase()==='/auth/signup') {
      const fullName=String(input.fullName||'').trim(), email=String(input.email||'').trim().toLowerCase(), password=String(input.password||''), departmentId=Number(input.departmentId);
      if(!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<8 || !departments.some(d=>d.id===departmentId)) return fail(400,'Enter your name, a valid email, a password with at least 8 characters, and a valid department.');
      const eKey=`users/email-${emailKey(email)}`;
      if(await read(eKey)) return fail(409,'An account with this email already exists.');
      // The first account created on a fresh test deployment becomes Admin; subsequent accounts are Department Heads.
      const existing=await allWithPrefix('users/id-');
      const pw=await hashPassword(password);
      const user={id:randomUUID(),name:fullName,email,role:existing.length===0?'Admin':'DepartmentHead',departmentId,passwordSalt:pw.salt,passwordHash:pw.hash,createdAt:new Date().toISOString()};
      await write(userKey(user.id),user);
      await write(eKey,{id:user.id});
      const roleNote=user.role==='Admin'?' This first account has administrator access.':' You can now log in.';
      return json(201,{message:`Account created.${roleNote}`,role:user.role});
    }
    if(method==='POST' && path.toLowerCase()==='/auth/login') {
      const email=String(input.email||'').trim().toLowerCase(), password=String(input.password||'');
      if(!email || !password) return fail(400,'Email and password are required.');
      const emailRecord=await read(`users/email-${emailKey(email)}`);
      const user=emailRecord ? await read(userKey(emailRecord.id)) : null;
      if(!user || !await passwordMatches(password,{salt:user.passwordSalt,hash:user.passwordHash})) return fail(401,'Invalid email or password.');
      const token=randomBytes(32).toString('hex');
      await write(`sessions/${token}`,{userId:user.id,expiresAt:Date.now()+7*24*60*60*1000});
      return json(200,{message:'Login successful.',token,user:publicUser(user)});
    }
    const auth=await currentUser(event); if(auth.error) return auth.error;
    const user=auth.user, isAdmin=user.role==='Admin';
    if(method==='GET' && path.toLowerCase()==='/reports') {
      if(!isAdmin) return fail(403,'Administrator access is required.');
      const reports=(await allWithPrefix('reports/')).sort((a,b)=>new Date(b.reportingDate)-new Date(a.reportingDate));
      return json(200,await Promise.all(reports.map(expandedReport)));
    }
    const userReports=path.match(/^\/reports\/user\/([^/]+)$/i);
    if(method==='GET' && userReports) {
      if(userReports[1]!==user.id && !isAdmin) return fail(403,'You can only view your own reports.');
      const reports=(await allWithPrefix('reports/')).filter(r=>r.submittedById===userReports[1]).sort((a,b)=>new Date(b.reportingDate)-new Date(a.reportingDate));
      return json(200,await Promise.all(reports.map(expandedReport)));
    }
    if(method==='POST' && path.toLowerCase()==='/reports') {
      const required=['projectTitle','projectStatus','projectSummary','challenges','nextSteps','importance'];
      if(required.some(k=>!String(input[k]||'').trim())) return fail(400,'Please complete all required report fields.');
      const id=Date.now();
      const report={id,projectTitle:String(input.projectTitle).trim(),departmentId:user.departmentId,submittedById:user.id,projectStatus:String(input.projectStatus),projectSummary:String(input.projectSummary).trim(),challenges:String(input.challenges).trim(),nextSteps:String(input.nextSteps).trim(),importance:String(input.importance),dueDate:input.dueDate || new Date().toISOString().slice(0,10),reportingDate:new Date().toISOString(),reviewStatus:'Pending',adminFeedback:'',attachmentFileName:null,attachmentFilePath:null};
      await write(reportKey(id),report);
      return json(201,{message:'Report submitted successfully.',reportId:id});
    }
    const download=path.match(/^\/reports\/([^/]+)\/attachment\/download$/i);
    if(method==='GET' && download) {
      const report=await read(reportKey(download[1]));
      if(!report) return fail(404,'Report not found.');
      if(report.submittedById!==user.id && !isAdmin) return fail(403,'You cannot view this attachment.');
      if(!report.attachmentFilePath) return fail(404,'No attachment is available.');
      const file=await read(attachmentKey(report.id));
      if(!file) return fail(404,'Attachment file not found.');
      return {statusCode:200,headers:{'Content-Type':file.contentType,'Content-Disposition':`inline; filename="${String(file.fileName).replace(/[\"\r\n]/g,'_')}"`,'Cache-Control':'private, no-store'},body:file.base64,isBase64Encoded:true};
    }
    const upload=path.match(/^\/reports\/([^/]+)\/attachment$/i);
    if(method==='POST' && upload) {
      const report=await read(reportKey(upload[1]));
      if(!report) return fail(404,'Report not found.');
      if(report.submittedById!==user.id && !isAdmin) return fail(403,'You cannot attach a file to this report.');
      const fileName=String(input.fileName||'attachment').split(/[\\/]/).pop();
      const ext=fileName.includes('.')?fileName.split('.').pop().toLowerCase():'';
      const allowed=['pdf','doc','docx','xls','xlsx','png','jpg','jpeg'];
      const base64=String(input.base64||'').replace(/^data:[^;]+;base64,/,'');
      if(!allowed.includes(ext)) return fail(400,'Allowed files: PDF, Word, Excel, PNG and JPG.');
      if(!base64 || base64.length>4_800_000) return fail(400,'Please select a file smaller than 3.5 MB for reliable browser upload.');
      const contentType=String(input.contentType||'application/octet-stream');
      await write(attachmentKey(report.id),{fileName,contentType,base64});
      report.attachmentFileName=fileName; report.attachmentFilePath=attachmentKey(report.id); await write(reportKey(report.id),report);
      return json(200,{message:'Attachment uploaded successfully.',fileName});
    }
    const resubmit=path.match(/^\/reports\/([^/]+)\/resubmit$/i);
    if(method==='PUT' && resubmit) {
      const report=await read(reportKey(resubmit[1]));
      if(!report) return fail(404,'Report not found.');
      if(report.submittedById!==user.id) return fail(403,'You can only edit your own reports.');
      if(report.reviewStatus!=='Rejected') return fail(400,'Only rejected reports can be resubmitted.');
      for(const k of ['projectTitle','projectStatus','projectSummary','challenges','nextSteps','importance']) if(!String(input[k]||'').trim()) return fail(400,'Please complete all required report fields.');
      Object.assign(report,{projectTitle:String(input.projectTitle).trim(),projectStatus:input.projectStatus,projectSummary:input.projectSummary,challenges:input.challenges,nextSteps:input.nextSteps,importance:input.importance,dueDate:input.dueDate||report.dueDate,reportingDate:new Date().toISOString(),reviewStatus:'Pending',adminFeedback:''});
      await write(reportKey(report.id),report); return json(200,{message:'Report resubmitted successfully.',reportId:report.id});
    }
    const review=path.match(/^\/reports\/([^/]+)\/review$/i);
    if(method==='PUT' && review) {
      if(!isAdmin) return fail(403,'Administrator access is required.');
      if(!['Approved','Rejected'].includes(input.reviewStatus)) return fail(400,'Review status must be Approved or Rejected.');
      const report=await read(reportKey(review[1])); if(!report) return fail(404,'Report not found.');
      report.reviewStatus=input.reviewStatus; report.adminFeedback=String(input.adminFeedback||'').trim(); await write(reportKey(report.id),report);
      return json(200,{message:`Report ${input.reviewStatus.toLowerCase()} successfully.`});
    }
    return fail(404,'API endpoint not found.');
  } catch(error) {
    console.error('Forge Report API error:',error);
    return fail(500,'The server encountered an error. Please try again.');
  }
}
