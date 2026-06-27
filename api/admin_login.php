<?php
require_once __DIR__ . '/config.php';
handleOptions();
startAdminSession();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = getJsonInput();
    $email = trim($data['email'] ?? '');
    $password = $data['password'] ?? '';

    if ($email === '' || $password === '') {
        jsonError('Email and password are required.');
    }

    try {
        $pdo = getDB();
        $stmt = $pdo->prepare('SELECT id, full_name, password_hash FROM users WHERE email = ? AND role = ?');
        $stmt->execute([$email, 'admin']);
        $admin = $stmt->fetch();

        if (!$admin || !password_verify($password, $admin['password_hash'])) {
            jsonError('Invalid credentials.', 401);
        }

        $_SESSION['admin_id'] = (int) $admin['id'];
        $_SESSION['admin_name'] = $admin['full_name'];

        jsonResponse([
            'success' => true,
            'admin' => [
                'id' => (int) $admin['id'],
                'full_name' => $admin['full_name'],
            ],
        ]);
    } catch (PDOException $e) {
        jsonError('Login failed: ' . $e->getMessage(), 500);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    session_destroy();
    jsonResponse(['success' => true, 'message' => 'Logged out']);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!empty($_SESSION['admin_id'])) {
        jsonResponse([
            'success' => true,
            'authenticated' => true,
            'admin' => [
                'id' => $_SESSION['admin_id'],
                'full_name' => $_SESSION['admin_name'] ?? 'Admin',
            ],
        ]);
    }
    jsonResponse(['success' => true, 'authenticated' => false]);
}

jsonError('Method not allowed', 405);
