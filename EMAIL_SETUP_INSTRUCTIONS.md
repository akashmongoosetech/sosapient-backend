# Email Configuration Setup Instructions

## Step 1: Gmail Setup
1. Go to your Gmail account settings
2. Enable 2-Factor Authentication if not already enabled
3. Go to Security → App passwords
4. Generate a new app password for "Mail"
5. Copy the 16-character app password (not your regular Gmail password)

## Step 2: Update your .env file
Add these lines to your backend `.env` file:

```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-gmail-address@gmail.com
EMAIL_PASS=your-16-character-app-password
ADMIN_EMAIL=admin@sosapient.com
```

## Step 3: Replace the placeholders
- `your-gmail-address@gmail.com` → Your actual Gmail address
- `your-16-character-app-password` → The app password from Step 1
- `admin@sosapient.com` → Email where you want to receive contact form submissions

## Step 4: Restart the server
After updating the .env file, restart your backend server with `npm start`

## Alternative Email Providers
If you don't want to use Gmail, you can use other SMTP providers:

### Outlook/Hotmail
```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_USER=your-email@outlook.com
EMAIL_PASS=your-password
```

### Yahoo
```env
EMAIL_HOST=smtp.mail.yahoo.com
EMAIL_PORT=587
EMAIL_USER=your-email@yahoo.com
EMAIL_PASS=your-app-password
```

## Testing
Once configured, the contact form will:
1. Save the contact data to database ✓
2. Send email notification to ADMIN_EMAIL ✓
3. Show success message to user ✓
