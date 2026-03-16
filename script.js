
    document.addEventListener('contextmenu', event => event.preventDefault());
    document.body.style.userSelect = 'none';
        
    const firebaseConfig = {
        apiKey: "AIzaSyDR2OugzoVNnKN6OUKsPxC9ajldlhanteE",
        authDomain: "tournament-af6dd.firebaseapp.com",
        projectId: "tournament-af6dd",
        storageBucket: "tournament-af6dd.firebasestorage.app",
        messagingSenderId: "726964405659",
        appId: "1:726964405659:web:d03f72c2d6f8721bc98d3e",
        measurementId: "G-GK0JNQ44N7"
    };

    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.database();

    let currentUserData = null;
    let pendingAction = null; 
    let incomingReferralCode = null; 

    const urlParams = new URLSearchParams(window.location.search);
    incomingReferralCode = urlParams.get('ref');

    function navigateTo(pageId) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(pageId)?.classList.add('active');
        loadPageContent(pageId);
        
        document.querySelectorAll('.nav-item').forEach(item => {
            const isActive = item.getAttribute('onclick').includes(pageId);
            item.className = 'nav-item text-center transition-all duration-300';
            
            if (isActive) {
                item.classList.add('text-white', 'scale-125', '-translate-y-1', 'font-bold', 'drop-shadow-md');
            } else {
                item.classList.add('text-white/70', 'scale-100');
            }
        });
        window.scrollTo(0, 0);
    }

    function showToast(message, isError = false) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `fixed top-5 right-5 text-white py-2 px-4 rounded-lg shadow-lg ${isError ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gradient-to-r from-green-500 to-green-600'}`;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }

    function formatCurrency(amount) {
        return `PKR ${new Intl.NumberFormat('en-PK', { minimumFractionDigits: 0 }).format(amount)}`;
    }

    function toggleModal(modalId, show) { document.getElementById(modalId).classList.toggle('active', show); }

    function checkLoginAndAct(event, actionType, ...args) {
        event.preventDefault(); 
        if (!auth.currentUser) {
            pendingAction = { type: actionType, args: args };
            toggleModal('authModal', true); 
            return;
        }
        if (actionType === 'playGameUrl') playGameUrl(...args);
        else if (actionType === 'joinTournament') joinTournament(event, ...args);
    }

    auth.onAuthStateChanged(async user => {
        const showAppControls = !!user;
        document.getElementById('app-header').style.display = showAppControls ? 'flex' : 'none';
        document.getElementById('user-bottom-nav').style.display = showAppControls ? 'block' : 'none';
        
        navigateTo('homePage');

        if (user) {
            if (localStorage.getItem('game_played_pending') === 'true') {
                localStorage.removeItem('game_played_pending');
                db.ref(`users/${user.uid}/wallet_balance`).transaction(bal => (bal || 0) + 1, (err, comm, snap) => {
                    if (comm) {
                        db.ref(`transactions/${user.uid}`).push({ amount: 1, type: 'credit', description: 'Game Play Reward', created_at: new Date().toISOString() });
                        showToast('🎉 You earned PKR 1 for playing!');
                    }
                });
            }

            const activeTid = localStorage.getItem('active_tournament_id');
            if (activeTid) {
                const startTime = parseInt(localStorage.getItem('game_start_time'));
                if (startTime) {
                    const duration = Math.floor((Date.now() - startTime) / 1000);
                    localStorage.removeItem('active_tournament_id');
                    localStorage.removeItem('game_start_time');
                    db.ref(`participants/${activeTid}/${user.uid}`).update({ score: duration, gameResult: `Survived: ${duration}s` });
                    showToast(`Played for ${duration} seconds! Score updated.`);
                }
            }

            try {
                const userSnap = await db.ref('users/' + user.uid).once('value');
                currentUserData = { uid: user.uid, ...userSnap.val() };
                
                const balanceFormatted = formatCurrency(currentUserData.wallet_balance || 0);
                document.getElementById('wallet-balance-header').innerHTML = `<i class="fas fa-wallet text-red-500"></i> ${balanceFormatted}`;
                
                const currentPageId = document.querySelector('.page.active')?.id;
                if (currentPageId && currentPageId !== 'homePage') loadPageContent(currentPageId);
               
                if (pendingAction) {
                    const { type, args } = pendingAction;
                    pendingAction = null; 
                    toggleModal('authModal', false);
                    if (type === 'playGameUrl') playGameUrl(...args);
                    else if (type === 'joinTournament') {
                        const dummyEvent = { preventDefault: () => {}, target: { closest: () => ({ parentElement: { querySelector: () => ({ textContent: 'Tournament' }) } }) } };
                        joinTournament(dummyEvent, ...args);
                    }
                }

                db.ref('users/' + user.uid).on('value', snap => {
                    currentUserData = { uid: user.uid, ...snap.val() };
                    const updatedBalance = formatCurrency(currentUserData.wallet_balance || 0);
                    document.getElementById('wallet-balance-header').innerHTML = `<i class="fas fa-wallet text-red-500"></i> ${updatedBalance}`;
                    const mainBalanceEl = document.getElementById('wallet-main-balance');
                    if (mainBalanceEl && document.getElementById('walletPage').classList.contains('active')) {
                        mainBalanceEl.textContent = updatedBalance;
                    }
                });
            } catch (error) {
                console.error("Error loading user data:", error);
                showToast("Failed to load user data.", true);
                auth.signOut();
            }
        } else {
            currentUserData = null;
            document.getElementById('wallet-balance-header').innerHTML = `<i class="fas fa-wallet text-red-500"></i> PKR...`;
            loadPageContent(document.querySelector('.page.active')?.id || 'homePage');
        }
    });

    function loadPageContent(pageId) {
        const pageContainer = document.getElementById(pageId);
        if (!pageContainer) return;
        switch (pageId) {
            case 'loginPage': pageContainer.innerHTML = ''; break;
            case 'homePage': renderHomePage(pageContainer); break;
            case 'myTournamentsPage': renderMyTournamentsPage(pageContainer); break;
            case 'walletPage': renderWalletPage(pageContainer); break;
            case 'profilePage': renderProfilePage(pageContainer); break;
        }
    }

    async function renderHomePage(container) { /* This function is unchanged, it can be copied from previous correct versions */ }
    async function renderMyTournamentsPage(container) { /* This function is unchanged, it can be copied from previous correct versions */ }
    async function renderWalletPage(container) { /* This function is unchanged, it can be copied from previous correct versions */ }
    async function renderProfilePage(container) { /* This function is unchanged, it can be copied from previous correct versions */ }
    function attachLoginListeners() { /* This function is unchanged, it can be copied from previous correct versions */ }
    function attachMyTournamentsListeners() { /* This function is unchanged, it can be copied from previous correct versions */ }
    function playGameUrl(url, tournamentId = null) { /* This function is unchanged, it can be copied from previous correct versions */ }
    function generateReferralLink(uid) { /* This function is unchanged, it can be copied from previous correct versions */ }
    function copyReferralLink() { /* This function is unchanged, it can be copied from previous correct versions */ }
    function logout() { auth.signOut(); }
    function changePassword() { auth.sendPasswordResetEmail(auth.currentUser.email).then(() => showToast(`Reset link sent.`)).catch(err => showToast(err.message, true)); }

    async function joinTournament(event, tournamentId, entryFee) {
        event.preventDefault();
        const user = auth.currentUser;
        if (!user) return showToast('Login required!', true);
        if (currentUserData.wallet_balance < entryFee) return showToast('Insufficient balance!', true);
        if ((await db.ref(`participants/${tournamentId}/${user.uid}`).once('value')).exists()) return showToast("Already joined!", true);
        
        const tournamentSnap = await db.ref(`tournaments/${tournamentId}/title`).once('value');
        const tournamentTitle = tournamentSnap.val() || 'Tournament';

        const newTransactionKey = db.ref(`transactions/${user.uid}`).push().key;

        const updates = {
            [`/users/${user.uid}/wallet_balance`]: currentUserData.wallet_balance - entryFee,
            [`/participants/${tournamentId}/${user.uid}`]: { status: 'Participated', joined_at: new Date().toISOString() },
            [`/transactions/${user.uid}/${newTransactionKey}`]: { amount: entryFee, type: 'debit', description: `Entry: ${tournamentTitle}`, created_at: new Date().toISOString() }
        };
        await db.ref().update(updates);
        showToast('Joined successfully!');
    }

    async function addMoney(event) {
        event.preventDefault();
        const amount = Number(document.getElementById('add-amount').value);
        const tid = document.getElementById('deposit-tid').value.trim();
        const sourceType = document.getElementById('deposit-source-type').value.trim();

        if (amount <= 0 || !tid || !sourceType) return showToast('All fields are required!', true);
        
        const user = auth.currentUser;
        if (!user) return showToast('Login required!', true);

        await db.ref(`pending_deposits/${user.uid}`).push({
            amount: amount, tid: tid, source_details: sourceType, status: 'pending',
            created_at: new Date().toISOString(),
            user_email: currentUserData.email || user.email,
            user_username: currentUserData.username || 'N/A'
        });

        showToast('Deposit request submitted! Awaiting verification.');
        toggleModal('addMoneyModal', false);
        event.target.reset();
    }

    // --- FINAL UPDATED withdrawMoney FUNCTION ---
    async function withdrawMoney(event) {
        event.preventDefault();
        const amount = Number(document.getElementById('withdraw-amount').value);
        const withdrawNumber = document.getElementById('withdraw-number').value.trim();
        const ownerName = document.getElementById('withdraw-owner-name').value.trim();
        const accountType = document.getElementById('withdraw-account-type').value.trim();

        if (amount <= 0) return showToast('Amount must be positive!', true);
        if (!withdrawNumber || !ownerName || !accountType) return showToast('Please fill all withdrawal details!', true);
        if (amount > currentUserData.wallet_balance) return showToast('Insufficient funds!', true);
        
        const user = auth.currentUser;
        if (!user) return showToast('Login required!', true);

        try {
            const newBalance = currentUserData.wallet_balance - amount;
            
            const transactionRef = db.ref(`transactions/${user.uid}`).push();
            const pendingWithdrawalRef = db.ref(`pending_withdrawals/${user.uid}`).push();

            const updates = {};
            updates[`/users/${user.uid}/wallet_balance`] = newBalance;
            updates[transactionRef.path] = {
                amount: amount,
                type: 'debit',
                description: `Withdrawal initiated`,
                status: 'requested',
                created_at: new Date().toISOString()
            };
            updates[pendingWithdrawalRef.path] = { 
                amount: amount, status: 'pending',
                withdrawal_account: withdrawNumber,
                withdrawal_owner_name: ownerName,
                withdrawal_account_type: accountType,
                created_at: new Date().toISOString(),
                user_uid: user.uid,
                user_email: currentUserData.email || user.email,
                user_username: currentUserData.username || 'N/A',
                transaction_id: transactionRef.key
            };
            
            await db.ref().update(updates);

            showToast('Withdrawal request sent! Awaiting admin approval.');
            toggleModal('withdrawMoneyModal', false);
            event.target.reset();

        } catch (error) {
            console.error("Withdrawal Failed:", error);
            showToast('Withdrawal request failed! Please check console.', true);
        }
    }

    document.addEventListener('DOMContentLoaded', () => { 
        if (firebase.apps.length) { 
            attachLoginListeners(); 
            document.getElementById('addMoneyForm').addEventListener('submit', addMoney); 
            document.getElementById('withdrawMoneyForm').addEventListener('submit', withdrawMoney); 
        }
    });

    // NOTE: The renderHomePage, renderMyTournamentsPage, etc. functions were removed for brevity. 
    // You should keep your existing correct versions of those functions.
    // The main fix is in the `withdrawMoney` function provided above.
