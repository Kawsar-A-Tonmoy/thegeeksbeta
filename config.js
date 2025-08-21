import dotenv from 'dotenv';

dotenv.config();

export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};


export const BKASH_NUMBER = '01960788862'; // Replace with your Bkash number
export const COD_NUMBER = '01960788862'; // Replace with your COD contact number

export const DELIVERY_FEE = 70; // Default delivery fee

