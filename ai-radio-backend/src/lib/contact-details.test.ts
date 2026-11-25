import test from 'node:test';
import assert from 'node:assert/strict';
import { containsContactDetails } from './contact-details';

test('email addresses and phone numbers are recognised', () => {
  for (const t of ['someone@example.com', 'jane at gmail dot com', 'jane (at) example (dot) org', '+1 (555) 010-4477', 'news for 5550104477']) {
    assert.equal(containsContactDetails(t), true, t);
  }
});

test('ordinary topics pass', () => {
  for (const t of ['SpaceX launches', 'the 2024-2025 NBA season', 'what happened at the dot com crash', 'a look at Booking.com earnings', '@elonmusk posts']) {
    assert.equal(containsContactDetails(t), false, t);
  }
});
