import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(Deno.env.get('PORTAL_ORIGINS') ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
]);

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin'
};

function jsonResponse(status: number, body: Record<string, unknown>, origin: string | null) {
  const headers = new Headers({
    ...corsHeaders,
    'Content-Type': 'application/json'
  });
  if (origin && allowedOrigins.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async request => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') {
    if (origin && !allowedOrigins.has(origin)) {
      return jsonResponse(403, { error: 'This origin is not allowed.' }, null);
    }
    return new Response('ok', {
      headers: {
        ...corsHeaders,
        ...(origin ? { 'Access-Control-Allow-Origin': origin } : {})
      }
    });
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Use POST to create an account.' }, origin);
  }
  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse(403, { error: 'This origin is not allowed.' }, null);
  }
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Account provisioning is missing its Supabase environment configuration.');
    return jsonResponse(500, { error: 'Account provisioning is not configured.' }, origin);
  }

  const authorization = request.headers.get('authorization') ?? '';
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return jsonResponse(401, { error: 'Sign in as an administrator to continue.' }, origin);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return jsonResponse(401, { error: 'Your sign-in has expired. Sign in again.' }, origin);
  }

  const { data: admin, error: adminError } = await supabase
    .from('profiles')
    .select('role, active, must_change_password')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (adminError) {
    console.error('Could not verify the account-provisioning administrator.', adminError);
    return jsonResponse(500, { error: 'Could not verify administrator access.' }, origin);
  }
  if (admin?.role !== 'admin' || !admin.active || admin.must_change_password) {
    return jsonResponse(403, { error: 'Active administrator access is required.' }, origin);
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Provide valid account details.' }, origin);
  }

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const fullName = typeof input.full_name === 'string' ? input.full_name.trim() : '';
  const role = typeof input.role === 'string' ? input.role : '';
  const password = typeof input.temporary_password === 'string' ? input.temporary_password : '';
  const studentId = typeof input.student_id === 'string' ? input.student_id.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return jsonResponse(400, { error: 'Enter a valid email address.' }, origin);
  }
  if (!fullName || fullName.length > 120) {
    return jsonResponse(400, { error: 'Enter a full name containing 1 to 120 characters.' }, origin);
  }
  if (!['student', 'teacher', 'admin'].includes(role)) {
    return jsonResponse(400, { error: 'Choose a valid account role.' }, origin);
  }
  if (password.length < 8 || password.length > 128) {
    return jsonResponse(400, { error: 'The temporary password must contain 8 to 128 characters.' }, origin);
  }
  if (role === 'student' && (!studentId || studentId.length > 80)) {
    return jsonResponse(400, { error: 'Student accounts require an ID containing 1 to 80 characters.' }, origin);
  }

  const normalizedStudentId = role === 'student' ? studentId : null;
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: fullName,
      full_name: fullName,
      ...(normalizedStudentId ? { student_id: normalizedStudentId } : {})
    }
  });
  if (createError || !created.user) {
    return jsonResponse(400, { error: createError?.message ?? 'Could not create the account.' }, origin);
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      email,
      display_name: fullName,
      full_name: fullName,
      student_id: normalizedStudentId,
      role,
      active: true,
      must_change_password: true
    })
    .eq('id', created.user.id);

  if (profileError) {
    const { error: cleanupError } = await supabase.auth.admin.deleteUser(created.user.id);
    if (cleanupError) {
      console.error('Profile setup and cleanup both failed for newly created account.', {
        userId: created.user.id,
        profileError,
        cleanupError
      });
      return jsonResponse(500, {
        error: 'The Auth account was created but profile setup and cleanup failed. Contact your project administrator.'
      }, origin);
    }
    return jsonResponse(400, { error: `Could not finish setting up the account: ${profileError.message}` }, origin);
  }

  return jsonResponse(201, {
    user: {
      id: created.user.id,
      email,
      full_name: fullName,
      role,
      student_id: normalizedStudentId
    }
  }, origin);
});
