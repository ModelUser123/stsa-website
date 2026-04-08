const { handleCors, jsonResponse } = require('./auth');
const { getSupabaseClient } = require('./supabase');

exports.handler = async (event) => {
  const corsResult = handleCors(event);
  if (corsResult) return corsResult;

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found
      throw error;
    }

    return jsonResponse(200, { event: data || null });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
