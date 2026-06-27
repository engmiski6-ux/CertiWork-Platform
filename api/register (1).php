<?php
require_once __DIR__ . '/config.php';
handleOptions();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError('Method not allowed', 405);
}

$data = getJsonInput();
$fullName = trim($data['full_name'] ?? '');
$email = trim($data['email'] ?? '');
$specialty = trim($data['specialty'] ?? '');

if ($fullName === '' || $email === '' || $specialty === '') {
    jsonError('Full name, email, and specialty are required.');
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonError('Invalid email address.');
}

try {
    $pdo = getDB();

    $stmt = $pdo->prepare('SELECT id, full_name, specialty FROM users WHERE email = ? AND role = ?');
    $stmt->execute([$email, 'employee']);
    $existing = $stmt->fetch();

    if ($existing) {
        $update = $pdo->prepare('UPDATE users SET full_name = ?, specialty = ? WHERE id = ?');
        $update->execute([$fullName, $specialty, $existing['id']]);
        $userId = (int) $existing['id'];
    } else {
        $insert = $pdo->prepare('INSERT INTO users (full_name, email, role, specialty) VALUES (?, ?, ?, ?)');
        $insert->execute([$fullName, $email, 'employee', $specialty]);
        $userId = (int) $pdo->lastInsertId();
    }

    jsonResponse([
        'success' => true,
        'userId' => $userId,
        'fullName' => $fullName,
        'specialty' => $specialty,
        'track' => specialtyToTrack($specialty),
    ]);
} catch (PDOException $e) {
    jsonError('Registration failed: ' . $e->getMessage(), 500);
}
