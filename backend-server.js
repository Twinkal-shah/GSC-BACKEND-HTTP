const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const cors = require('cors');
const app = express();

// Load environment variables
dotenv.config();

// Supabase client setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // Use service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Middleware
app.use(express.json());
app.use(cors());

// API key authentication middleware
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.API_KEY;
  
  if (!apiKey || apiKey !== validApiKey) {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid or missing API key' 
    });
  }
  
  next();
}

// Route to store user data
app.post('/store-user', authenticateApiKey, async (req, res) => {
  try {
    const userData = req.body;
    
    // Validate required fields
    if (!userData.email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }
    
    console.log('Received user data:', userData);
    
    // Check if user already exists
    const { data: existingUsers, error: queryError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', userData.email)
      .limit(1);
      
    if (queryError) {
      console.error('Error checking for existing user:', queryError);
      return res.status(500).json({
        success: false,
        error: 'Database query error',
        details: queryError.message
      });
    }
    
    // If user exists, update their info
    if (existingUsers && existingUsers.length > 0) {
      const userId = existingUsers[0].id;
      
      // Update the existing user (excluding email which is used as the key)
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          name: userData.name,
          picture: userData.picture,
          last_login: new Date().toISOString(),
          // Only update these fields if they were provided
          app_version: userData.app_version || undefined,
          timezone: userData.timezone || undefined,
          document_info: userData.document_info || undefined
        })
        .eq('id', userId)
        .select();
        
      if (updateError) {
        console.error('Error updating user:', updateError);
        return res.status(500).json({
          success: false,
          error: 'Error updating user',
          details: updateError.message
        });
      }
      
      // Also log this login to user_logins table
      await logUserLogin(userData.email, userData);
      
      return res.json({
        success: true,
        message: 'User updated successfully',
        user: updatedUser[0]
      });
    }
    
    // User doesn't exist, create new user
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([
        {
          id: userData.user_id, // Use provided UUID
          email: userData.email,
          name: userData.name || null,
          picture: userData.picture || null,
          created_at: userData.install_date || new Date().toISOString(),
          last_login: new Date().toISOString(),
          app_version: userData.app_version || null,
          timezone: userData.timezone || null,
          document_info: userData.document_info || null,
          installation_source: userData.installation_source || null
        }
      ])
      .select();
      
    if (insertError) {
      console.error('Error inserting user:', insertError);
      return res.status(500).json({
        success: false,
        error: 'Error creating user',
        details: insertError.message
      });
    }
    
    // Also log this first login to user_logins table
    await logUserLogin(userData.email, userData);
    
    return res.json({
      success: true,
      message: 'User created successfully',
      user: newUser[0]
    });
  } catch (error) {
    console.error('Server error processing user data:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error',
      details: error.message
    });
  }
});

// Helper function to log user logins
async function logUserLogin(email, userData) {
  try {
    const { error } = await supabase
      .from('user_logins')
      .insert([
        {
          email: email,
          login_time: new Date().toISOString(),
          document_info: userData.document_info || null,
          app_version: userData.app_version || null
        }
      ]);
      
    if (error) {
      console.error('Error logging user login:', error);
    }
  } catch (error) {
    console.error('Error in logUserLogin:', error);
  }
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// For testing only - allow importing in tests
if (process.env.NODE_ENV === 'test') {
  module.exports = app;
} 