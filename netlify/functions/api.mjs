import { createClient } from '@supabase/supabase-js';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
};
const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const fail = (statusCode, message) => json(statusCode, { message });

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Netlify environment variables SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function getPath(event) {
  let p = event.path || '/';
  p = p.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '');
  return p.replace(/\/$/, '') || '/';
}
function body(event) {
  if (!event.body) return {};
  try { return JSON.parse(event.body); } catch { return {}; }
}
async function currentUser(supabase, event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: fail(401, 'Please log in again.') };
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return { error: fail(401, 'Your session has expired. Please log in again.') };
  const { data: profile, error } = await supabase.from('profiles').select('id, full_name, email, role, department_id, departments(id,name,site)').eq('id', authData.user.id).single();
  if (error || !profile) return { error: fail(403, 'Your account profile is not set up. Contact the administrator.') };
  return { user: { id: profile.id, name: profile.full_name, email: profile.email, role: profile.role, departmentId: profile.department_id, department: profile.departments?.name || '', site: profile.departments?.site || '' }, profile };
}
const isAdmin = (u) => u?.role === 'Admin';
const reportSelect = 'id,project_title,department_id,submitted_by_id,project_status,project_summary,challenges,next_steps,importance,due_date,reporting_date,review_status,admin_feedback,attachment_file_name,attachment_file_path,departments(name,site),profiles!reports_submitted_by_id_fkey(full_name)';
function mapReport(r, attachmentUrl = null) {
  return { id:r.id, projectTitle:r.project_title, department:r.departments?.name || '', site:r.departments?.site || '', submittedBy:r.profiles?.full_name || '', departmentId:r.department_id, submittedById:r.submitted_by_id, projectStatus:r.project_status, projectSummary:r.project_summary, challenges:r.challenges, nextSteps:r.next_steps, importance:r.importance, dueDate:r.due_date, reportingDate:r.reporting_date, reviewStatus:r.review_status, adminFeedback:r.admin_feedback, attachmentFileName:r.attachment_file_name, attachmentFilePath:r.attachment_file_path, attachmentUrl };
}
async function signedAttachment(supabase, path) {
  if (!path) return null;
  const { data } = await supabase.storage.from('report-attachments').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  let supabase;
  try { supabase = getClient(); } catch (e) { return fail(503, e.message); }
  const path = getPath(event);
  const method = event.httpMethod;
  const input = body(event);

  try {
    if (method === 'GET' && path.toLowerCase() === '/auth/departments') {
      const { data, error } = await supabase.from('departments').select('id,name,site').order('name');
      if (error) return fail(500, 'Could not load departments. Check the Supabase setup.');
      return json(200, data);
    }

    if (method === 'POST' && path.toLowerCase() === '/auth/signup') {
      const fullName = String(input.fullName || '').trim();
      const email = String(input.email || '').trim().toLowerCase();
      const password = String(input.password || '');
      const departmentId = Number(input.departmentId);
      if (!fullName || !email || password.length < 8 || !departmentId) return fail(400, 'Enter your name, email, a department, and a password with at least 8 characters.');
      const { data: department } = await supabase.from('departments').select('id').eq('id', departmentId).maybeSingle();
      if (!department) return fail(400, 'Choose a valid department.');
      const { data: created, error: createError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
      if (createError) return fail(400, createError.message.includes('already') ? 'An account with this email already exists.' : createError.message);
      const { error: profileError } = await supabase.from('profiles').insert({ id: created.user.id, full_name: fullName, email, role: 'DepartmentHead', department_id: departmentId });
      if (profileError) {
        await supabase.auth.admin.deleteUser(created.user.id);
        return fail(500, 'Account setup failed. Please try again or contact the administrator.');
      }
      return json(201, { message: 'Account created. You can now log in.' });
    }

    if (method === 'POST' && path.toLowerCase() === '/auth/login') {
      const email = String(input.email || '').trim().toLowerCase();
      const password = String(input.password || '');
      if (!email || !password) return fail(400, 'Email and password are required.');
      const { data: session, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError || !session.session) return fail(401, 'Invalid email or password.');
      const { data: profile, error: profileError } = await supabase.from('profiles').select('id,full_name,email,role,department_id,departments(id,name,site)').eq('id', session.user.id).single();
      if (profileError || !profile) return fail(403, 'Your profile is missing. Contact the administrator.');
      return json(200, { message: 'Login successful.', token: session.session.access_token, user: { id:profile.id, name:profile.full_name, email:profile.email, role:profile.role, departmentId:profile.department_id, department:profile.departments?.name || '', site:profile.departments?.site || '' } });
    }

    const auth = await currentUser(supabase, event);
    if (auth.error) return auth.error;
    const user = auth.user;

    if (method === 'GET' && path.toLowerCase() === '/reports') {
      if (!isAdmin(user)) return fail(403, 'Administrator access is required.');
      const { data, error } = await supabase.from('reports').select(reportSelect).order('reporting_date', { ascending: false });
      if (error) return fail(500, 'Could not load reports.');
      const mapped = await Promise.all(data.map(async r => mapReport(r, await signedAttachment(supabase, r.attachment_file_path))));
      return json(200, mapped);
    }

    const userReportsMatch = path.match(/^\/reports\/user\/([^/]+)$/i);
    if (method === 'GET' && userReportsMatch) {
      if (userReportsMatch[1] !== user.id && !isAdmin(user)) return fail(403, 'You can only view your own reports.');
      const { data, error } = await supabase.from('reports').select(reportSelect).eq('submitted_by_id', userReportsMatch[1]).order('reporting_date', { ascending: false });
      if (error) return fail(500, 'Could not load your reports.');
      return json(200, await Promise.all(data.map(async r => mapReport(r, await signedAttachment(supabase, r.attachment_file_path)))));
    }

    if (method === 'POST' && path.toLowerCase() === '/reports') {
      const fields = ['projectTitle','projectStatus','projectSummary','challenges','nextSteps','importance'];
      if (fields.some(k => !String(input[k] || '').trim())) return fail(400, 'Please complete all required report fields.');
      const row = { project_title:String(input.projectTitle).trim(), department_id:user.departmentId, submitted_by_id:user.id, project_status:input.projectStatus, project_summary:input.projectSummary, challenges:input.challenges, next_steps:input.nextSteps, importance:input.importance, due_date:input.dueDate || new Date().toISOString().slice(0,10), reporting_date:new Date().toISOString(), review_status:'Pending' };
      const { data, error } = await supabase.from('reports').insert(row).select('id').single();
      if (error) return fail(500, 'Could not save the report.');
      return json(201, { message:'Report submitted successfully.', reportId:data.id });
    }

    const resubmitMatch = path.match(/^\/reports\/(\d+)\/resubmit$/i);
    if (method === 'PUT' && resubmitMatch) {
      const { data: existing, error: lookupError } = await supabase.from('reports').select('id,submitted_by_id,review_status').eq('id', Number(resubmitMatch[1])).maybeSingle();
      if (lookupError || !existing) return fail(404, 'Report not found.');
      if (existing.submitted_by_id !== user.id) return fail(403, 'You can only edit your own reports.');
      if (existing.review_status !== 'Rejected') return fail(400, 'Only rejected reports can be resubmitted.');
      const { error } = await supabase.from('reports').update({ project_title:input.projectTitle, project_status:input.projectStatus, project_summary:input.projectSummary, challenges:input.challenges, next_steps:input.nextSteps, importance:input.importance, due_date:input.dueDate, reporting_date:new Date().toISOString(), review_status:'Pending', admin_feedback:null }).eq('id', existing.id);
      if (error) return fail(500, 'Could not resubmit the report.');
      return json(200, { message:'Report resubmitted successfully.', reportId:existing.id });
    }

    const reviewMatch = path.match(/^\/reports\/(\d+)\/review$/i);
    if (method === 'PUT' && reviewMatch) {
      if (!isAdmin(user)) return fail(403, 'Administrator access is required.');
      if (!['Approved','Rejected'].includes(input.reviewStatus)) return fail(400, 'Review status must be Approved or Rejected.');
      const { data: existing } = await supabase.from('reports').select('id').eq('id', Number(reviewMatch[1])).maybeSingle();
      if (!existing) return fail(404, 'Report not found.');
      const { error } = await supabase.from('reports').update({ review_status:input.reviewStatus, admin_feedback:String(input.adminFeedback || '').trim() || null }).eq('id', existing.id);
      if (error) return fail(500, 'Could not update report review.');
      return json(200, { message:`Report ${input.reviewStatus.toLowerCase()} successfully.` });
    }

    const uploadMatch = path.match(/^\/reports\/(\d+)\/attachment$/i);
    if (method === 'POST' && uploadMatch) {
      const reportId = Number(uploadMatch[1]);
      const { data: report } = await supabase.from('reports').select('id,submitted_by_id').eq('id', reportId).maybeSingle();
      if (!report) return fail(404, 'Report not found.');
      if (report.submitted_by_id !== user.id && !isAdmin(user)) return fail(403, 'You cannot attach a file to this report.');
      const name = String(input.fileName || 'attachment').split(/[\\/]/).pop();
      const contentType = String(input.contentType || 'application/octet-stream');
      const base64 = String(input.base64 || '');
      const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
      if (!['pdf','doc','docx','xls','xlsx','png','jpg','jpeg'].includes(ext)) return fail(400, 'Allowed files: PDF, Word, Excel, PNG and JPG.');
      if (!base64 || base64.length > 4_800_000) return fail(400, 'Please select a file smaller than 3.5 MB for reliable browser upload.');
      const bytes = Buffer.from(base64, 'base64');
      const pathInBucket = `${user.id}/${reportId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('report-attachments').upload(pathInBucket, bytes, { contentType, upsert:false });
      if (uploadError) return fail(500, 'The report was saved, but its attachment could not be uploaded. Check the Supabase storage bucket setup.');
      const { error: updateError } = await supabase.from('reports').update({ attachment_file_name:name, attachment_file_path:pathInBucket }).eq('id', reportId);
      if (updateError) return fail(500, 'The file uploaded but its report record could not be updated.');
      return json(200, { message:'Attachment uploaded successfully.', fileName:name });
    }

    return fail(404, 'API endpoint not found.');
  } catch (error) {
    console.error('Netlify API error:', error);
    return fail(500, 'The server encountered an error. Check the Netlify function logs for details.');
  }
}
